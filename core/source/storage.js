import { createGCSClient, uuid, environment } from './utils.js'
import { flushPatchRecords, getState } from './persistence.js'
import { queryBigQuery } from './gcp-api.js'

const DOWNLOAD_RETRY_INTERVAL = 1000
const UPLOAD_TYPE = 'application/json;type=upload'
const UPLOAD_STORAGE_TYPE = 'gcs'
const HISTORY_CONTENT_TYPE = 'text/plain; charset=utf-8'

const {
  INTERNAL_GCS_API_ENDPOINT,
  EXTERNAL_GCS_API_ENDPOINT,
  GCS_BUCKET_NAME,
  MODE,
  GC_PROJECT_ID,
  GCS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

//  need to redirect url because of quirk in how apiEndpoint is used for constructing signed urls
const directedURL = (url, internal) => {
  if (MODE === 'local') {
    if (internal) {
      const [bucketId, objectId] = (new URL(url)).pathname.slice(1).split('/')
      //  signed urls have issues when not coming from configured -public-domain
      //  in fake-gcs-server
      return `${INTERNAL_GCS_API_ENDPOINT}/storage/v1/b/${bucketId}/o/${objectId}?alt=media`
    }
    else return `${EXTERNAL_GCS_API_ENDPOINT}/${url.split('/').slice(3).join('/')}`
  }
  else return url
}

const storage = new createGCSClient({
  apiEndpoint: INTERNAL_GCS_API_ENDPOINT,
  projectId: GC_PROJECT_ID,
  credentials: JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS)
})

const bucket = storage.bucket(GCS_BUCKET_NAME)
const gcpCredentials = JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS)

async function upload(contentType, internal=false) {
  const id = uuid()
  const info = { type: 'gcs', id, bucket: GCS_BUCKET_NAME }

  const options  = {
    version: 'v4',
    action: 'write',
    expires: Date.now() + 15 * 60 * 1000,
    contentType
  }
  const [url] = await bucket.file(id).getSignedUrl(options)
  return { url: directedURL(url, internal), info }
}

function downloadURL(objectId, internal) {
  const expires = Date.now() + 15 * 60 * 1000
  const options = { action: 'read', expires }

  return bucket
    .file(objectId)
    .getSignedUrl(options)
    .then(([url]) => directedURL(url, internal))
}

function parseJSONField(value, fallback=null) {
  if (value === null || value === undefined) return fallback

  try {
    return JSON.parse(value)
  }
  catch (_) {
    return fallback
  }
}

function activePatch(patch) {
  return patch
    .filter(({ path }) => Array.isArray(path) && path[0] === 'active')
    .map(operation => {
      const activeOperation = {
        ...operation,
        path: operation.path.slice(1)
      }

      if (Array.isArray(operation.from) && operation.from[0] === 'active') {
        activeOperation.from = operation.from.slice(1)
      }

      return activeOperation
    })
}

function timestampMilliseconds(timestamp) {
  if (typeof timestamp === 'number') return timestamp

  const parsed = Date.parse(timestamp)
  return Number.isNaN(parsed) ? timestamp : parsed
}

function rowOperation(row) {
  const operation = {
    op: row.op,
    path: parseJSONField(row.path, [])
  }

  if (row.op === 'move' || row.op === 'copy') operation.from = parseJSONField(row.from, null)
  if (row.op === 'add' || row.op === 'replace' || row.op === 'test') operation.value = parseJSONField(row.value, null)

  return operation
}

function historyText(rows) {
  const grouped = new Map()

  rows.forEach(row => {
    const key = `${row.index}:${row.timestamp}`
    if (!grouped.has(key)) grouped.set(key, { timestamp: row.timestamp, index: row.index, rows: [] })
    grouped.get(key).rows.push(row)
  })

  return [...grouped.values()]
    .sort((a, b) => (
      timestampMilliseconds(a.timestamp) - timestampMilliseconds(b.timestamp)
      || a.index - b.index
    ))
    .map(({ timestamp, rows }) => ({
      timestamp,
      patch: activePatch(
        rows
          .sort((a, b) => (a.operation_index ?? 0) - (b.operation_index ?? 0))
          .map(rowOperation)
      )
    }))
    .filter(({ patch }) => patch.length > 0)
    .map(({ timestamp, patch }) => `${timestampMilliseconds(timestamp)} ${JSON.stringify(patch)}`)
    .join('\n')
}

async function patchRows(id) {
  return queryBigQuery({
    creds: gcpCredentials,
    project: GC_PROJECT_ID,
    query: `
      SELECT
        *
      FROM
        \`${GC_PROJECT_ID}.core.patches\`
      WHERE
        id = @id
      ORDER BY
        timestamp,
        \`index\`
    `,
    params: { id }
  })
}

async function historyDownloadURL(id, internal) {
  await flushPatchRecords()

  const text = historyText(await patchRows(id))
  const objectId = uuid()

  await bucket
    .file(objectId)
    .save(text, {
      resumable: false,
      metadata: {
        contentType: HISTORY_CONTENT_TYPE
      }
    })

  return downloadURL(objectId, internal)
}

async function download(domain, id, retries=3, internal=false) {
  if (!id) throw new Error('id required for download')

  try {
    const state = await getState(domain, id, { path: ['$.active_type', '$.active.type', '$.active.id', '$.external'] })
    if (!state) throw new Error(`No state found for ${id}`)

    const activeType = state?.['$.active_type']?.[0]
    const activeStorageType = state?.['$.active.type']?.[0]
    const uploadId = state?.['$.active.id']?.[0]
    const external = state?.['$.external']?.[0]

    if (activeType === UPLOAD_TYPE || activeStorageType === UPLOAD_STORAGE_TYPE || external) {
      if (!uploadId) throw new Error(`No uploaded object found for ${id}`)
      return downloadURL(uploadId, internal)
    }

    return historyDownloadURL(id, internal)
  }
  catch (error) {
    console.warn('Error getting download url', error, id)
    if (retries === 0) throw new Error('Error getting download url')
    // TODO: ensure errors propogate
    else {
      await new Promise(r => setTimeout(r, DOWNLOAD_RETRY_INTERVAL))
      return download(domain, id, retries-1, internal)
    }
  }
}

export { upload, download }
