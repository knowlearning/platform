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
      currentSnapshot = applyPatch(
        currentSnapshot,
        [operation],
        true,
        false
      ).newDocument
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
