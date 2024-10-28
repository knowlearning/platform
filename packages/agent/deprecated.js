import resolveReference from './resolve-reference.js'

export async function create({ id=uuid(), active, active_type }) {
  return resolveReference(undefined, undefined, id, active_type, active)
}
