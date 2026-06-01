import { DJWT } from './utils.js'
import { gcpTokenCache as tokenCache } from './stateful.js'

export async function importPrivateKey(pem) {
  // Remove the header, footer, and line breaks
  const pemContents = pem
    .replace(/-----BEGIN PRIVATE KEY-----/, "")
    .replace(/-----END PRIVATE KEY-----/, "")
    .replace(/\s+/g, "")

  const binaryDer = Uint8Array.from(atob(pemContents), c => c.charCodeAt(0))

  return await crypto.subtle.importKey(
    "pkcs8",
    binaryDer.buffer,
    { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" },
    false,
    ["sign"]
  )
}

export async function getAccessToken(creds, scope) {
  const scopeKey = Array.isArray(scope) ? scope.join(" ") : scope

  const cached = tokenCache.get(scopeKey)
  const now = Date.now()

  // Return cached token if still valid (with 1 min buffer)
  if (cached && cached.expiresAt > now + 60000) {
    return cached.accessToken
  }

  const iat = DJWT.getNumericDate(0)
  const exp = DJWT.getNumericDate(3600)
  const payload = {
    iss: creds.client_email,
    scope: scopeKey,
    aud: "https://oauth2.googleapis.com/token",
    iat,
    exp
  }

  const key = await importPrivateKey(creds.private_key)

  const jwt = await DJWT.create({ alg: "RS256", typ: "JWT" }, payload, key)

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt
    })
  })

  if (!res.ok) {
    const error = await res.text()
    throw new Error(`Failed to get access token: ${res.status} ${error}`)
  }

  const { access_token, expires_in } = await res.json()
  const expiresAt = now + expires_in * 1000

  tokenCache.set(scopeKey, { accessToken: access_token, expiresAt })

  return access_token
}

async function gcpPOST(creds, url, scopes, payload) {
  const token = await getAccessToken(creds, scopes)
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${token}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  })

  const json = await response.json()

  if (!response.ok) {
    throw new Error(`GCP POST Failed: ${url} ${response.status} ${JSON.stringify(json)}`)
  }

  return json
}

async function gcpGET(creds, url, scopes) {
  const token = await getAccessToken(creds, scopes)
  const response = await fetch(url, {
    headers: {
      "Authorization": `Bearer ${token}`
    }
  })

  const json = await response.json()

  if (!response.ok) {
    throw new Error(`GCP GET Failed: ${url} ${response.status} ${JSON.stringify(json)}`)
  }

  return json
}

export async function insertRowsToBigQuery({
  creds,
  project,
  dataset,
  table,
  rows
}) {
  const response = await gcpPOST(
    creds,
    `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets/${dataset}/tables/${table}/insertAll`,
    'https://www.googleapis.com/auth/bigquery',
    {
      skipInvalidRows: true,
      ignoreUnknownValues: true,
      rows
    }
  )

  if (response.insertErrors) {
    console.warn("Insert errors:", JSON.stringify(response.insertErrors, null, 2))
  }

  return response
}

function bigQueryParameter(name, value) {
  return {
    name,
    parameterType: { type: 'STRING' },
    parameterValue: { value }
  }
}

function parseBigQueryValue(value, field) {
  if (value === null || value === undefined) return null

  if (field.type === 'INTEGER' || field.type === 'INT64') return Number.parseInt(value, 10)
  if (field.type === 'FLOAT' || field.type === 'FLOAT64' || field.type === 'NUMERIC') return Number.parseFloat(value)
  if (field.type === 'BOOLEAN' || field.type === 'BOOL') return value === 'true'

  return value
}

function parseBigQueryRows(schema, rows=[]) {
  const fields = schema?.fields || []

  return rows.map(row => {
    const parsed = {}
    row.f.forEach(({ v }, index) => {
      const field = fields[index]
      parsed[field.name] = parseBigQueryValue(v, field)
    })
    return parsed
  })
}

async function getBigQueryQueryResults(creds, project, jobReference, pageToken) {
  const url = new URL(`https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries/${jobReference.jobId}`)
  url.searchParams.set('timeoutMs', '10000')
  if (jobReference.location) url.searchParams.set('location', jobReference.location)
  if (pageToken) url.searchParams.set('pageToken', pageToken)

  return gcpGET(creds, url.toString(), 'https://www.googleapis.com/auth/bigquery')
}

export async function queryBigQuery({
  creds,
  project,
  query,
  params={}
}) {
  const scopes = 'https://www.googleapis.com/auth/bigquery'
  const queryResponse = await gcpPOST(
    creds,
    `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/queries`,
    scopes,
    {
      query,
      useLegacySql: false,
      parameterMode: 'NAMED',
      queryParameters: Object.entries(params).map(([name, value]) => bigQueryParameter(name, value))
    }
  )

  let currentResponse = queryResponse
  while (!currentResponse.jobComplete) {
    currentResponse = await getBigQueryQueryResults(creds, project, queryResponse.jobReference)
  }

  const rows = parseBigQueryRows(currentResponse.schema, currentResponse.rows)
  let { pageToken } = currentResponse
  const { jobReference } = queryResponse

  while (pageToken) {
    const page = await getBigQueryQueryResults(creds, project, jobReference, pageToken)
    rows.push(...parseBigQueryRows(page.schema || currentResponse.schema, page.rows))
    pageToken = page.pageToken
  }

  return rows
}

const isRetryable = {
  timeout: true,
  internalError: true,
  backendError: true,
  rateLimitExceeded: true
}

export function bigQueryBatchInserter({
  creds,
  project,
  dataset,
  table,
  batchMs = 1000
}) {
  let queue = []
  let retryQueue = []
  let timer = null

  async function flush() {
    if (!queue.length && !retryQueue.length) return

    const batch = [...retryQueue, ...queue]
    retryQueue = []
    queue = []

    const rows = batch.map(({ row, insertId }) => ({
      json: row,
      insertId
    }))

    const res = await insertRowsToBigQuery({
      creds,
      project,
      dataset,
      table,
      rows
    })

    if (res.insertErrors) {
      Object
        .values(res.insertErrors)
        .filter(({ errors }) => errors.every(e => isRetryable[e.reason]))
        .forEach(({ index }) => retryQueue.push(batch[index]))
    }
  }

  function scheduleFlush() {
    if (!timer) {
      timer = setTimeout(async () => {
        timer = null
        await flush()
      }, batchMs)
    }
  }

  return {
    insert(row, insertId = crypto.randomUUID()) {
      queue.push({ row, insertId })
      scheduleFlush()
    },
    async flush() {
      if (timer) {
        clearTimeout(timer)
        timer = null
      }
      await flush()
    }
  }
}
