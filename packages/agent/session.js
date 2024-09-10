import resolveReference from './resolve-reference.js'
import { encodeNATSSubject } from './utils.js'
import { publish } from './message-queue.js'


const sessionInitialized = new Promise(async resolve => {
  await new Promise(r => setTimeout(r))
  const env = await environment()
  const nc = await natsClientPromise

  await resolveReference(env.domain, env.auth.user, 'sessions')
  //  TODO: perhaps allow messageQueue.publish to be request?
  const subject = encodeNATSSubject(env.domain, env.auth.user, 'sessions')
  const patch = [{
    op: 'add',
    path: [SESSION_ID],
    value: {
      reference: HOST,
      claims: {},
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

export async function uploadURL(id=uuid(), type) {
  return updateSession('uploads', { id })
}

export async function downloadURL(id) {
  return updateSession('downloads', { id })
}

export async function query(query, params, domain) {
  console.log('UPDATING SESSION!!!!!!!!!!', query, params, domain)
  const result = await updateSession('queries', {query, params, domain})
  //  TODO: handle errors
  return result.rows
}

export async function updateSession(field, value) {
  await sessionInitialized
  const id = uuid()

  const patch = [{ op: 'add', path: [SESSION_ID, field, id], value }]
  const { id: sessionId } = await resolveReference(null, null, 'sessions')

  return new Promise( (resolve, reject) => publish(sessionId, patch, false, true, (error, response) => {
    if (error) {
      console.warn('REJECTING SESSION UPDATE PUBLISH', error)
      reject(error)
    }
    else resolve(response)
  }))
}
