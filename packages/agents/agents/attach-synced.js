import { applyPatch } from 'fast-json-patch'
import { standardJSONPatch } from '@knowlearning/patch-proxy'

// Wraps a state promise with a .synced(callback?) method that applies external
// patches to the live proxy in-place.
//
// Usage:
//   const promise = attachSynced(watchers, (ctx, resolve) => {
//     const p = new Promise(async (...) => {
//       const proxy = new PatchProxy(data, patch => {
//         if (ctx.applyingExternalUpdate) return
//         // ... interact
//       })
//       resolve(proxy, qualifiedKey)
//       resolvePromise(proxy)
//     })
//     return p
//   })
export default function attachSynced(watchers, init) {
  const ctx = { applyingExternalUpdate: false }
  let shouldSync = false
  let syncCallbacks = []
  let syncRegistered = false
  let resolvedProxy = null
  let resolvedKey = null

  function registerSyncWatcher() {
    if (syncRegistered) return
    syncRegistered = true
    if (!watchers[resolvedKey]) watchers[resolvedKey] = []
    watchers[resolvedKey].push(({ patch, state, ii }) => {
      if (!patch) return
      const pending = ctx.pendingInteractions?.size
        ? Promise.all(ctx.pendingInteractions)
        : Promise.resolve()
      pending.then(() => {
        const isOwn = ctx.ownInteractions?.has(ii)
        const echoBatch = isOwn ? ctx.ownInteractionBatches?.get(ii) : null
        if (isOwn) {
          ctx.ownInteractions.delete(ii)
          if (echoBatch) ctx.ownInteractionBatches.delete(ii)
        } else {
          ctx.applyingExternalUpdate = true
          applyPatch(resolvedProxy, standardJSONPatch(patch))
          ctx.applyingExternalUpdate = false
        }
        if (echoBatch) {
          echoBatch.state = state
          if (echoBatch.remaining !== undefined) echoBatch.remaining -= 1
          if ((echoBatch.remaining === undefined || echoBatch.remaining === 0) && !echoBatch.resolved) {
            echoBatch.resolved = true
            syncCallbacks.forEach(cb => cb(echoBatch.state, patch))
            echoBatch.resolve()
          }
          return
        }
        syncCallbacks.forEach(cb => cb(state, patch))
        if (isOwn && ctx.echoResolvers?.length) {
          ctx.echoResolvers.shift()()
        }
      })
    })
  }

  function resolve(proxy, key) {
    resolvedProxy = proxy
    resolvedKey = key
    if (shouldSync) registerSyncWatcher()
  }

  const promise = init(ctx, resolve)

  promise.synced = function(callback) {
    shouldSync = true
    ctx.syncActive = true
    if (!ctx.echoResolvers) ctx.echoResolvers = []
    if (callback) syncCallbacks.push(callback)
    if (resolvedProxy) registerSyncWatcher()
    return promise
  }

  return promise
}
