import { watch, state, synced } from './synchronization.js'
import { encodeNATSSubject } from './utils.js'

const sideEffectResponsePaths = new Map()

const sessionInitialized = new Promise(async resolve => {
  await new Promise(r => setTimeout(r))
  const env = await environment()
  const nc = await natsClientPromise

  //  TODO: perhaps allow messageQueue.publish to be request?
  const subject = encodeNATSSubject(env.domain, env.auth.user, 'sessions')
  const patch = [{
    op: 'add',
    path: [SESSION_ID],
    value: {
      reference: HOST,
      subscriptions: {},
      queries: {},
      uploads: {},
      downloads: {},
      embeds: {}
    }
  }]
  await nc.publish(subject, JSONCodec().encode(patch))
  resolve()
})

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
      await sessionInitialized
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

async function updateSession(field, value) {
  await sessionInitialized
  const nc = await natsClientPromise
  const id = uuid()
  const env = await environment()

  //  TODO: perhaps allow messageQueue.publish to be request?
  const subject = encodeNATSSubject(env.domain, env.auth.user, 'sessions')
  const patch = [{
    op: 'add',
    path: [SESSION_ID, field, id],
    value
  }]
  const messages = await nc.requestMany(subject, JSONCodec().encode(patch), {
    max: 2, // one is a jetstream consumer response
    timeout: 1000
  })

  let response
  for await (const msg of messages) {
    const r = JSONCodec().decode(msg.data)
    if (r.value) {
      response = r.value
      break
    }
  }

  return response

}

export async function query(query, params, domain) {
  return updateSession('queries', {query, params, domain})
}