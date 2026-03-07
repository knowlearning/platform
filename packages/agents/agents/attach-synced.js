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
    watchers[resolvedKey].push(({ patch }) => {
      if (!patch) return
      ctx.applyingExternalUpdate = true
      applyPatch(resolvedProxy, standardJSONPatch(patch))
      ctx.applyingExternalUpdate = false
      syncCallbacks.forEach(cb => cb(resolvedProxy, patch))
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
    if (callback) syncCallbacks.push(callback)
    if (resolvedProxy) registerSyncWatcher()
    return promise
  }

  return promise
}
