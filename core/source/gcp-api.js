import { DJWT } from './utils.js'

const tokenCache = new Map()

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

  const jwt = await DJWT.create({ alg: "RS256", typ: "JWT" }, payload, creds.private_key)

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

async function gcpPOST(url, scopes, payload) {
  const token = await getAccessToken(creds, scopes)
  const response = fetch(url, {
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

export async function insertRowsToBigQuery({
  creds,
  project,
  dataset,
  table,
  rows
}) {
  const response = await gcpPost(
    `https://bigquery.googleapis.com/bigquery/v2/projects/${project}/datasets/${dataset}/tables/${table}/insertAll`,
    'https://www.googleapis.com/auth/bigquery',
    {
      skipInvalidRows: true,
      ignoreUnknownValues: true,
      rows
    }
  )

  if (response.insertErrors) {
    console.warn("Insert errors:", JSON.stringify(json.insertErrors, null, 2))
  }

  return response
}
