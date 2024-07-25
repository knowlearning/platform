import { v4 as uuid, validate as isUUID } from 'uuid'

const references = {}

// TODO: actual resolution check
export async function resolveUUIDReference(id) {
  return references[id]
}

async function uuidInUse(id) {
  //  TODO: do this existing uuid reference check for real
  await new Promise(r => setTimeout(r, 10))
  return references[id]
}

//  TODO: persistent reference resolution
export default async function resolve(domain, user, scope) {
  user = await user

  if (!references[domain]) references[domain] = {}
  if (!references[domain][user]) references[domain][user] = {}
  if (!references[domain][user][scope]) {
    const id = isUUID(scope) && !(await uuidInUse(scope)) ? scope : uuid()
    references[domain][user][scope] = id
    references[id] = { domain, user, scope }
  }

  return references[domain][user][scope]
}
