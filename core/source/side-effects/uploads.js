import { upload } from '../storage.js'
import interact, { assertInteractionAllowed } from '../interact.js'
import { getState } from '../persistence.js'
import { environment, isUUID, uuidv5 } from '../utils.js'

const { GCS_BUCKET_NAME } = environment

export default async function ({ id: requestId, domain, user, session, patch, si, ii, send }) {
  for (let index = 0; index < patch.length; index++) {
    const { path, op, value } = patch[index]

    if (op === 'add' && path.length === 1 && path[0] === 'active') {
      const { id, type, name } = value
      if (!isUUID(requestId) || !isUUID(id)) throw new Error('Upload request and file IDs must be UUIDs')
      if (!Number.isSafeInteger(ii) || ii < 1) throw new Error('Invalid upload request revision')

      const contentType = type
      const signingType = type
      const objectId = uuidv5(JSON.stringify([
        'upload-v1', domain, user, requestId, id, contentType, signingType ?? null
      ]), uuidv5.URL)
      const info = { type: 'gcs', id: objectId, bucket: GCS_BUCKET_NAME }

      const patch = [
        { op: 'add', value: contentType, path: ['active_type'] },
        { op: 'add', value: info, path: ['active'] },
        { op: 'add', value: true, path: ['external'] }
      ]

      if (name) patch.push({ op: 'add', value: name, path: ['name'] })

      await assertInteractionAllowed(domain, user, id, patch)

      if (ii > 1) {
        const state = await getState(domain, id)
        if (
          state?.external !== true ||
          state.active_type !== contentType ||
          state.active?.type !== 'gcs' ||
          state.active?.id !== objectId ||
          state.active?.bucket !== GCS_BUCKET_NAME
        ) {
          throw new Error('Upload request is incomplete or superseded')
        }
      }

      const { url } = await upload(signingType, false, objectId)
      if (ii === 1) {
        const result = await interact(domain, user, id, patch)
        if (!Number.isSafeInteger(result?.ii) || result.ii < 1) {
          throw new Error('Failed to confirm upload metadata')
        }
      }
      send({ si, ii, url })
      return
    }
  }

  send({ si, ii }) // non-side-effect inducing patch
}
