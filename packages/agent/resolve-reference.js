import { publish } from './message-queue.js'
import { decodeNATSSubject, encodeNATSSubject } from './utils.js'

async function getInfoOrClaimScope(id, jsm, depth=0) {
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
          const { domain, auth: { user } } = await environment()
          return (
            jsm
              .streams
              .add({ name: id, subjects: [encodeNATSSubject(domain, user, id)] })
              .then(() => ({ domain, owner: user, name: id }))
              .catch(async error => {
                if (error.api_error?.err_code === 10058) {
                  return getInfoOrClaimScope(id, jsm, depth+1)
                }
                else throw error
              })
          )
        }
        else throw error
      })
  )
}

//  TODO: persistent reference resolution
export default async function resolveReference(domain, user, scope, newType='application/json', newState={}) {
  const isUUIDOnlyReference = isUUID(scope) && !user && !domain
  const jsm = await jetstreamManagerPromise

  if (isUUIDOnlyReference) {
    const id = scope
    console.log('GETTING INFO OR CLAIMING SCOPE', domain, user, scope)
    const { domain:d, owner, name } = await getInfoOrClaimScope(scope, jsm)
    console.log('GOT INFO OR CLAIMED SCOPE', domain, user, scope, d, owner, name)
    scope = name
    user = owner
    domain = d
    const env = await environment()
    if (env.domain === domain && env.auth.user === owner) {
      //  TODO: deprecate name? use only "scope?"
      const metadataValue = { domain, owner: user, name: scope, type: newType }
      const patch = [
        { metadata: true, op: 'add', path: [], value: metadataValue },
        { op: 'add', path: [], value: newState }
      ]
      await publish(id, patch, true).catch(error => {
        if (error.api_error?.err_code === 10071) {
          // means already initialized
        }
        else throw error
      })
    }
    return { id, domain, scope, user }
  }

  if (!user || !domain) {
    const env  = await environment()
    if (!user) user = env.auth.user
    if (!domain) domain = env.domain
  }

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
      await jsm.streams.add({ name: scope, subjects: [subject] })
    }
    else {
      id = uuid()
      await jsm.streams.add({ name: id, subjects: [subject] }).catch(error => {
        if (error.api_error?.err_code === 10065) {
          // stream already exists
        }
        else throw error
      })
    }
    const env = await environment()
    if (env.domain === domain && env.auth.user === user) {
      const metadataValue = { domain, owner: user, name: scope, type: newType }
      const patch = [
        { metadata: true, op: 'add', path: [], value: metadataValue },
        { op: 'add', path: [], value: newState }
      ]
      await publish(id, patch, true).catch(error => {
        if (error.api_error?.err_code === 10071) {
          // means already initialized
        }
        else throw error
        //  TODO: actually pull down domain/user/scope if
        //        expectation for first patch failed
      })
    }
  }

  return { id, user, domain, scope }
}
