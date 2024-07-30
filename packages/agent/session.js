import { v4 as uuid, validate as isUUID } from 'uuid'
import { watch, state } from './synchronization.js'

export const SESSION_ID = uuid()

const sideEffectResponsePaths = new Map()

const sessionsPromise = state('sessions').then(async state => {
  watch('sessions', async ({ patch, state }) => {
    console.log('SESSION MUTATION!!!!', patch, state)
    if (patch) {
      patch.forEach(
        update => {
          const pathHash = JSON.stringify(update.path)
          const sideEffectResponse = sideEffectResponsePaths.get(pathHash)
          if (sideEffectResponse) {
            sideEffectResponse(update.value)
          }
          sideEffectResponsePaths.delete(pathHash)
        }
      )
    }
  })
  await new Promise(r => setTimeout(r, 1))
  state[SESSION_ID] = {
    reference: window.location.host,
    subscriptions: {},
    queries: {},
    uploads: {},
    downloads: {},
    embeds: {}
  }
  return state
})

export function uploadURL(id=uuid()) {
  if (!isUUID(id)) throw new Error(`id for upload must be uuid got: ${id}`)

  const uploadsPath = [SESSION_ID, 'uploads', id]

  return new Promise( async (resolve, reject) => {
    const pathHash = JSON.stringify([...uploadsPath, 'url'])
    sideEffectResponsePaths.set(
      pathHash,
      url => {
        if (!url) reject('Error getting upload url')
        else resolve(url) 
      }
    )

    const sessions = await sessionsPromise

    console.log('SESSIONS????', sessions)

    sessions[SESSION_ID].uploads[id] = {}
  })
}