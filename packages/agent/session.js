import { encodeNATSSubject } from './utils.js'


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

export async function uploadURL(id=uuid(), type) {
  return updateSession('uploads', { id })
}

export async function downloadURL(id) {
  return updateSession('downloads', { id })
}

export async function query(query, params, domain) {
  return updateSession('queries', {query, params, domain})
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