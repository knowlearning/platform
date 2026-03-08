import { v4 as uuid, validate as isUUID } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'
import attachSynced from '../attach-synced.js'

export default function(scope='[]', user, domain, { keyToSubscriptionId, watchers, states, create, environment, lastMessageResponse, lastInteractionResponse, interact, pendingEchoCallbacks, log }) {
  let resolveMetadataPromise
  let metadataPromise = new Promise(resolve => resolveMetadataPromise = resolve)

  const statePromise = attachSynced(watchers, (ctx, resolveSync) => new Promise(async (resolveState, rejectState) => {
    const { auth: { user: u }, domain: d, session } = await environment()

    const qualifiedScope = isUUID(scope) ? scope : `${!domain || domain === d ? '' : domain}/${!user || user === u ? '' : user}/${scope}`
    if (!keyToSubscriptionId[qualifiedScope]) {
      const id = uuid()

      keyToSubscriptionId[qualifiedScope] = id
      watchers[qualifiedScope] = []
      states[qualifiedScope] = new Promise(async (resolve, reject) => {
        await new Promise(r => setTimeout(r))
        interact('sessions', [{
          op: 'add',
          path: ['active', session, 'subscriptions', id],
          value: { scope, user, domain, ii: null }
        }], false)
        try {
          resolve(await lastMessageResponse())
        }
        catch (error) { reject(error) }
      })
    }

    await lastInteractionResponse[qualifiedScope]

    try {
      const data = structuredClone(await states[qualifiedScope])
      const active = data.active
      delete data.active
      resolveMetadataPromise(data)
      if (!ctx.ownInteractions) ctx.ownInteractions = new Set()
      if (!ctx.ownInteractionBatches) ctx.ownInteractionBatches = new Map()
      if (!ctx.pendingInteractions) ctx.pendingInteractions = new Set()
      if (!ctx.echoResolvers) ctx.echoResolvers = []
      let currentEchoBatch = null
      const proxy = new PatchProxy(active || {}, patch => {
        if (ctx.applyingExternalUpdate) return
        const activePatch = structuredClone(patch)
        activePatch.forEach(entry => entry.path.unshift('active'))
        let echoBatch
        if (ctx.syncActive && pendingEchoCallbacks) {
          if (!currentEchoBatch) {
            let resolveEcho
            const echoPromise = new Promise(r => resolveEcho = r)
            echoBatch = currentEchoBatch = { resolve: resolveEcho, resolved: false }
            pendingEchoCallbacks.add(echoPromise)
            echoPromise.then(() => pendingEchoCallbacks.delete(echoPromise))
            Promise.resolve().then(() => { currentEchoBatch = null })
          }
          else echoBatch = currentEchoBatch
        }
        const interactPromise = interact(scope, activePatch)
        const p = interactPromise.then(
          r => {
            ctx.ownInteractions.add(r.ii)
            if (echoBatch) ctx.ownInteractionBatches.set(r.ii, echoBatch)
            ctx.pendingInteractions.delete(p)
          },
          () => {
            if (echoBatch && !echoBatch.resolved) {
              echoBatch.resolved = true
              echoBatch.resolve()
            }
            ctx.pendingInteractions.delete(p)
          }
        )
        ctx.pendingInteractions.add(p)
      })
      resolveSync(proxy, qualifiedScope)
      resolveState(proxy)
    }
    catch (error) {
      rejectState(error)
    }
  }))

  statePromise.metadata = metadataPromise
  return statePromise
}
