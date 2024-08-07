import { watch, state } from './synchronization.js'

const sideEffectResponsePaths = new Map()

const sessionsPromise = new Promise(async (resolve, reject) => {
  await new Promise(r => setTimeout(r)) //  TODO: Remove. Currently this is necessary for environment global to be set
  const sessions = await state('sessions')
  watch('sessions', async ({ patch, state, history }) => {
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
    else {
      sessions[SESSION_ID] = {
        reference: HOST,
        subscriptions: {},
        queries: {},
        uploads: {},
        downloads: {},
        embeds: {}
      }
      resolve(sessions)
    }
  })
})

export function uploadURL(id=uuid(), type) {
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
    sessions[SESSION_ID].uploads[id] = { type }
  })
}

export function downloadURL(id) {
  if (!isUUID(id)) throw new Error(`id for download must be uuid got: ${id}`)

  const downloadsPath = [SESSION_ID, 'downloads', id]

  return new Promise( async (resolve, reject) => {
    const pathHash = JSON.stringify([...downloadsPath, 'url'])
    sideEffectResponsePaths.set(
      pathHash,
      url => {
        if (!url) reject('Error getting upload url')
        else resolve(url)
      }
    )

    const sessions = await sessionsPromise
    sessions[SESSION_ID].downloads[id] = {}
  })
}

export function query(query, params, domain) {
  const id = uuid()
  const queryPath = [SESSION_ID, 'queries', id]

  return new Promise( async (resolve, reject) => {
    const pathHash = JSON.stringify([...queryPath, 'response'])
    sideEffectResponsePaths.set(
      pathHash,
      response => {
        if (!response) reject('error getting query response')
        else resolve(response)
      }
    )

    const sessions = await sessionsPromise
    sessions[SESSION_ID].queries[id] = {
      query,
      params,
      domain
    }
  })
}