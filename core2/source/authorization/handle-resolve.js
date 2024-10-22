import {
  decodeJSON,
  encodeJSON,
  decodeNATSSubject,
  encodeNATSSubject,
  isUUID
} from './externals.js'
import { jsm, js } from './nats.js'

async function getInfoOrClaimScope(id, user, domain, depth=0) {
  if (depth > 3) throw new Error('Failed to get info or claim scope', id)

  await new Promise(r => setTimeout(r, depth*100))

  return (
    jsm
      .streams
      .info(id)
      .then(async info => {
        const subject = info.config.subjects[0]
        const [domain, owner, name] = decodeNATSSubject(subject)
        return { domain, owner, name }
      })
      .catch(async error => {
        if (error.code === '404') {
          return (
            createStream(id, domain, user, id)
              .then(() => ({ domain, owner: user, name: id }))
              .catch(async error => {
                if (error.api_error?.err_code === 10058) {
                  return getInfoOrClaimScope(id, user, domain, depth+1)
                }
                else throw error
              })
          )
        }
        else throw error
      })
  )
}

async function createStream(id, domain, user, scope) {
  const subject = encodeNATSSubject(domain, user, scope)
  return jsm.streams.add({ name: id, subjects: [subject], republish: { src: subject, dest: `effects.${subject}` } })
}

export default async function handleResolve(error, message) {
  const { data } = message
  const { domain, user, scope, newType, newState, envUser, envDomain } = decodeJSON(data)

  try {
    message.respond(encodeJSON(await resolveReference(domain, user, scope, newType, newState, envUser, envDomain)))
  }
  catch (error) {
    console.log('ERROR HANDLING RESOLVE', domain, user, scope, newType, newState, envUser, envDomain, error)
  }

}

async function resolveReference(domain, user, scope, newType, newState, envUser, envDomain) {
  const isUUIDOnlyReference = isUUID(scope) && !user && !domain

  newType = newType || 'application/json'
  newState = newState || {}

  if (isUUIDOnlyReference) {
    const id = scope
    const { domain:d, owner, name } = await getInfoOrClaimScope(scope, envUser, envDomain)
    scope = name
    user = owner
    domain = d
    if (envDomain === domain && envUser === owner) {
      //  TODO: deprecate name? use only "scope?"
      const metadataValue = { domain, owner: user, name: scope, type: newType }
      const patch = [
        { metadata: true, op: 'add', path: [], value: metadataValue },
        { op: 'add', path: [], value: newState }
      ]
      await js.publish(
        encodeNATSSubject(domain, owner, scope),
        encodeJSON(patch),
        { expect: { lastSequence: 0 } }
      ).catch(error => {
        if (error.api_error?.err_code === 10071) {
          // means already initialized
        }
        else throw error
      })
    }
    return { id, domain, scope, user }
  }

  if (!user) user = envUser
  if (!domain) domain = envDomain
  if (!scope) scope = ''

  const subject = encodeNATSSubject(domain, user, scope)
  let id = await jsm.streams.find(subject).catch(error => {
    if (error.message = 'no stream matches subject') return undefined
    else throw error
  })

  if (!id) {
    if (isUUID(scope)) {
      //  TODO: handle trying to set when scope is id owned by another person
      //        but we want to generate another uuid for stream name, and use
      //        scope as just the scope
      id = scope
      await createStream(id, domain, user, scope)
    }
    else {
      id = uuid()
      await createStream(id, domain, user, scope).catch(error => {
        if (error.api_error?.err_code === 10065) {
          // stream already exists
        }
        else throw error
      })
    }
    if (envDomain === domain && envUser === user) {
      const metadataValue = { domain, owner: user, name: scope, type: newType }
      const patch = [
        { metadata: true, op: 'add', path: [], value: metadataValue },
        { op: 'add', path: [], value: newState }
      ]
      await js.publish(
        encodeNATSSubject(domain, user, scope),
        encodeJSON(patch),
        { expect: { lastSequence: 0 } }
      ).catch(error => {
        if (error.api_error?.err_code === 10071) {
          // means already initialized
        }
        else throw error
      })
    }
  }

  return { id, user, domain, scope }
}
