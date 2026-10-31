// Credential documents are created only by saveSession, never by an Agent.
export const SESSION_OWNER = 'core'
export const SESSION_TYPE = 'application/json;type=session'

const protectedFields = new Set(['owner', 'created', 'domain'])
const operations = new Set(['add', 'replace', 'remove', 'move'])

export function assertSessionPatchAllowed(patch, { active_type } = {}) {
  if (active_type === SESSION_TYPE) {
    throw new Error('AUTHENTICATION SESSIONS ARE READ ONLY')
  }
  if (!Array.isArray(patch)) throw new Error('INVALID PATCH')
  for (const operation of patch) {
    if (!operation || !operations.has(operation.op)) throw new Error('INVALID PATCH OPERATION')
    const { path, value } = operation
    // Persistence moves only within the destination array; from supplies an index.
    if (!Array.isArray(path) || !path.length || protectedFields.has(path[0])
      || path.some(part => typeof part !== 'string' && !Number.isSafeInteger(part))
      // Root quotes/backslashes could escape the current JSONPath serializer.
      || /['\\]/.test(path[0])) {
      throw new Error('PATCH CANNOT CHANGE PROTECTED METADATA')
    }
    if (path[0] === 'active_type' && value === SESSION_TYPE) {
      throw new Error('AUTHENTICATION SESSIONS ARE READ ONLY')
    }
  }
}
