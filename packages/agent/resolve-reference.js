import { publish } from './message-queue.js'

const references = {}

async function uuidInUse(id) {
  //  TODO: do this existing uuid reference check for real
  await new Promise(r => setTimeout(r))
  return references[id]
}

//  TODO: persistent reference resolution
export default async function resolveReference(domain, user, scope) {
  const isUUIDOnlyReference = isUUID(scope) && !user && !domain
  if (isUUIDOnlyReference) {
    let existingReference = references[scope]
    if (!existingReference) {
      const env = await environment()
      existingReference = {
        domain: env.domain,
        owner: env.auth.user,
        name: scope
      }
    }
    const { domain:d, owner, name } = existingReference
    scope = name
    user = owner
    domain = d
  }
  else if (!user || !domain) {
    const env  = await environment()
    if (!user) user = env.auth.user
    if (!domain) domain = env.domain
  }

  if (!references[domain]) references[domain] = {}
  if (!references[domain][user]) references[domain][user] = {}
  if (!references[domain][user][scope]) {
    const scopeIsNewUUID = isUUID(scope) && !(await uuidInUse(scope))
    const id = scopeIsNewUUID ? scope : uuid()

    //  TODO: deprecate name? use only "scope?"
    const metadataValue = { domain, owner: user, name: scope, type: 'application/json' }
    const patch = [
      { metadata: true, op: 'add', path: [], value: metadataValue },
      { op: 'add', path: [], value: {} }
    ]

    await publish(id, patch, true).catch(error => {
      //  TODO: actually pull down domain/user/scope if
      //        expectation for first patch failed
    })

    references[domain][user][scope] = id
    references[id] = metadataValue
  }

  return references[domain][user][scope]
}
