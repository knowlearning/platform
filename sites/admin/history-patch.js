import { applyPatch } from 'fast-json-patch/index.mjs'

export function applyHistoryPatch(snapshot, patch) {
  return applyPatch(
    snapshot,
    normalizeHistoryPatch(patch),
    true,
    false
  ).newDocument
}

export function normalizeHistoryPatch(patch) {
  return patch.map(operation => {
    const normalized = {
      ...operation,
      path: normalizeHistoryPath(operation.path)
    }

    if (operation.from !== undefined) normalized.from = normalizeHistoryPath(operation.from)

    return normalized
  })
}

function normalizeHistoryPath(path) {
  if (typeof path === 'string') return path
  if (!Array.isArray(path)) {
    throw new Error('History patch paths must be JSON Pointer strings or segment arrays.')
  }

  return `/${path.map(sanitizeHistoryPathSegment).join('/')}`
}

function sanitizeHistoryPathSegment(segment) {
  if (typeof segment === 'string') {
    return segment.replaceAll('~', '~0').replaceAll('/', '~1')
  }

  return String(segment)
}
