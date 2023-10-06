import { Storage } from '@google-cloud/storage'
import { v4 as uuid } from 'uuid'
import * as redis from './redis.js'

const {
  INTERNAL_GCS_API_ENDPOINT,
  EXTERNAL_GCS_API_ENDPOINT,
  GCS_BUCKET_NAME,
  MODE
} = process.env

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

const storage = new Storage({
  apiEndpoint: INTERNAL_GCS_API_ENDPOINT,
  projectId: process.env.GC_PROJECT_ID,
  credentials: JSON.parse(process.env.GCS_SERVICE_ACCOUNT_CREDENTIALS)
})

const bucket = storage.bucket(GCS_BUCKET_NAME)

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

async function download(id, retries=3, internal=false) {
  if (!id) throw new Error('id required for download')

  //  TODO: Validation. If is not an immutable scope, download history
  //        otherwise download referenced object as here

  try {
    const [uploadId] = await redis.client.json.get(id, { path: ['$.active.id'] })
    const expires = Date.now() + 15 * 60 * 1000
    const options = { action: 'read', expires }

    const [url] = await bucket.file(uploadId).getSignedUrl(options)
    return directedURL(url, internal)
  }
  catch (error) {
    console.warn('Erorr getting download url', error, id)
    if (retries === 0) throw new Error('Error getting download url')
    else return new Promise(resolve => {
      setTimeout(() => {
        download(id, retries-1, internal).then(r => resolve(r))
      }, 1000)
    })
  }
}

export { upload, download }
