import { v4 as uuid, validate as isUUID } from 'uuid'
import { publish } from './message-queue.js'

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
    const scopeIsNewUUID = isUUID(scope) && !(await uuidInUse(scope))
    const id = scopeIsNewUUID ? scope : uuid()

    const metadataValue = { domain, owner: user, scope, type: 'application/json' }
    const patch = [
      { metadata: true, op: 'add', path: [], value: metadataValue },
      { op: 'add', path: [], value: {} }
    ]
    await publish(id, patch, true)

    references[domain][user][scope] = id
    references[id] = metadataValue
  }

  return references[domain][user][scope]
}
