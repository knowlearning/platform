import { publish } from './message-queue.js'
import { encodeNATSSubject } from './utils.js'

async function getInfoOrClaimScope(id, jsm) {
  return (
    jsm
      .streams
      .info(id)
      .then(async info => {
        //  TODO: use stream info to get actual domain, owner, name
        const { domain, auth: { user } } = await environment()
        return { domain, owner: user, name: id }
      })
      .catch(async error => {
        if (error.code === '404') {
          const { domain, auth: { user } } = await environment()
          await jsm.streams.add({ name: id, subjects: [encodeNATSSubject(domain, user, id)] })
          return { domain, owner: user, name: id }
        }
        else throw error
      })
    )
}

//  TODO: persistent reference resolution
export default async function resolveReference(domain, user, scope) {
  const isUUIDOnlyReference = isUUID(scope) && !user && !domain
  const jsm = await jetstreamManagerPromise

  if (isUUIDOnlyReference) {
    const { domain:d, owner, name } = await getInfoOrClaimScope(scope, jsm)
    scope = name
    user = owner
    domain = d
    //  TODO: deprecate name? use only "scope?"
    const metadataValue = { domain, owner: user, name: scope, type: 'application/json' }
    const patch = [
      { metadata: true, op: 'add', path: [], value: metadataValue },
      { op: 'add', path: [], value: {} }
    ]
    await publish(scope, patch, true).catch(error => {
      console.log('ERROR publishing???', error)
      //  TODO: actually pull down domain/user/scope if
      //        expectation for first patch failed
    })
    return scope
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
      id = scope
      await jsm.streams.add({ name: scope, subjects: [subject] })
    }
    else {
      id = uuid()
      await jsm.streams.add({ name: id, subjects: [subject] })
    }
    const metadataValue = { domain, owner: user, name: scope, type: 'application/json' }
    const patch = [
      { metadata: true, op: 'add', path: [], value: metadataValue },
      { op: 'add', path: [], value: {} }
    ]
    await publish(id, patch, true).catch(error => {
      console.log('ERROR publishing???', error)
      //  TODO: actually pull down domain/user/scope if
      //        expectation for first patch failed
    })

  }

  return id
}
