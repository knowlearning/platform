import { v4 as uuid } from 'uuid'

const references = {}

//  TODO: persistent reference resolution
export default async function resolve(domain, user, scope) {
  if (!references[domain]) references[domain] = {}
  if (!references[domain][user]) references[domain][user] = {}
  if (!references[domain][user][scope]) {
    const id = uuid()
    references[domain][user][scope] = id
    references[id] = { domain, user, scope }
  }
  return references[domain][user][scope]
}
