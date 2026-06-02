import { applyPatch } from 'fast-json-patch/index.mjs'

export function applyHistoryPatch(snapshot, patch, operationOrder) {
  return applyOrderedHistoryPatch(snapshot, patch, operationOrder).snapshot
}

export function inspectHistoryPatchApplication(snapshot, patch, operationOrder) {
  try {
    return {
      ok: true,
      ...applyOrderedHistoryPatch(snapshot, patch, operationOrder),
      error: null
    }
  }
  catch (caughtError) {
    return {
      ok: false,
      snapshot,
      orderedPatch: caughtError?.orderedPatch || orderHistoryPatch(patch, operationOrder),
      operationOrder: caughtError?.operationOrder || resolveHistoryOperationOrder(patch, operationOrder),
      error: {
        name: caughtError?.name || 'HistoryPatchError',
        message: caughtError?.message || String(caughtError),
        failedPosition: caughtError?.failedPosition ?? null,
        failedOriginalIndex: caughtError?.failedOriginalIndex ?? null,
        failedOperation: caughtError?.failedOperation ?? null
      }
    }
  }
}

export function normalizeHistoryPatch(patch, operationOrder) {
  return orderHistoryPatch(patch, operationOrder).map(operation => {
    const normalized = {
      ...operation,
      path: normalizeHistoryPath(operation.path)
    }

    if (operation.from !== undefined) normalized.from = normalizeHistoryPath(operation.from)

    return normalized
  })
}

export function defaultHistoryOperationOrder(patch) {
  return patch.map((_, index) => index)
}

export function orderHistoryPatch(patch, operationOrder) {
  return resolveHistoryOperationOrder(patch, operationOrder).map(index => patch[index])
}

function applyOrderedHistoryPatch(snapshot, patch, operationOrder) {
  const operationOrderResolved = resolveHistoryOperationOrder(patch, operationOrder)
  const orderedPatch = operationOrderResolved.map(index => patch[index])
  const normalizedPatch = orderedPatch.map(operation => {
    const normalized = {
      ...operation,
      path: normalizeHistoryPath(operation.path)
    }

    if (operation.from !== undefined) normalized.from = normalizeHistoryPath(operation.from)

    return normalized
  })

  let currentSnapshot = snapshot

  normalizedPatch.forEach((operation, index) => {
    try {
      currentSnapshot = applyHistoryOperation(currentSnapshot, operation).newDocument
    }
    catch (caughtError) {
      caughtError.orderedPatch = orderedPatch
      caughtError.operationOrder = operationOrderResolved
      caughtError.failedPosition = index
      caughtError.failedOriginalIndex = operationOrderResolved[index]
      caughtError.failedOperation = orderedPatch[index]
      throw caughtError
    }
  })

  return {
    snapshot: currentSnapshot,
    orderedPatch,
    operationOrder: operationOrderResolved
  }
}

function applyHistoryOperation(snapshot, operation) {
  try {
    return applyPatch(snapshot, [operation], true, false)
  }
  catch (caughtError) {
    const fallbackOperation = appendFallbackHistoryOperation(snapshot, operation, caughtError)
    if (!fallbackOperation) throw caughtError
    return applyPatch(snapshot, [fallbackOperation], true, false)
  }
}

function appendFallbackHistoryOperation(snapshot, operation, error) {
  if (operation.op !== 'replace') return null
  if (error?.name !== 'OPERATION_PATH_UNRESOLVABLE') return null

  const pathSegments = parseHistoryPointer(operation.path)
  if (pathSegments.length === 0) return null

  const parentPathSegments = pathSegments.slice(0, -1)
  const lastSegment = pathSegments[pathSegments.length - 1]
  const parentValue = resolveHistoryValue(snapshot, parentPathSegments)

  if (!Array.isArray(parentValue) || !isHistoryArrayIndex(lastSegment)) return null
  if (Number(lastSegment) !== parentValue.length) return null

  return {
    ...operation,
    op: 'add'
  }
}

function resolveHistoryOperationOrder(patch, operationOrder) {
  const resolvedOrder = operationOrder || defaultHistoryOperationOrder(patch)

  if (resolvedOrder.length !== patch.length) {
    throw new Error('History operation order length must match the patch length.')
  }

  const seen = new Set()

  resolvedOrder.forEach(index => {
    if (!Number.isInteger(index) || index < 0 || index >= patch.length) {
      throw new Error('History operation order contains an invalid index.')
    }

    if (seen.has(index)) {
      throw new Error('History operation order may not contain duplicate indexes.')
    }

    seen.add(index)
  })

  return resolvedOrder
}

function resolveHistoryValue(snapshot, pathSegments) {
  let current = snapshot

  for (const segment of pathSegments) {
    if (Array.isArray(current)) {
      if (!isHistoryArrayIndex(segment)) return undefined

      const index = Number(segment)
      if (index < 0 || index >= current.length) return undefined
      current = current[index]
      continue
    }

    if (!current || typeof current !== 'object' || !(segment in current)) {
      return undefined
    }

    current = current[segment]
  }

  return current
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

function parseHistoryPointer(path) {
  if (path === '') return []
  if (!path.startsWith('/')) {
    throw new Error('History patch string paths must be valid JSON Pointers.')
  }

  return path
    .slice(1)
    .split('/')
    .map(segment => segment.replaceAll('~1', '/').replaceAll('~0', '~'))
}

function isHistoryArrayIndex(segment) {
  return /^(0|[1-9]\d*)$/.test(segment)
}
