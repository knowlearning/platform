import { v4 as uuid, validate as isUUID } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'

export default function(scope='[]', user, domain, { keyToSubscriptionId, watchers, states, create, environment, lastMessageResponse, lastInteractionResponse, tagIfNotYetTaggedInSession, interact, log }) {
  let resolveMetadataPromise
  let metadataPromise = new Promise(resolve => resolveMetadataPromise = resolve)

  const statePromise = new Promise(async (resolveState, rejectState) => {
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
        }], false, false)
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
      resolveState(new PatchProxy(active || {}, patch => {
        const activePatch = structuredClone(patch)
        activePatch.forEach(entry => entry.path.unshift('active'))
        interact(scope, activePatch)
      }))
    }
    catch (error) {
      rejectState(error)
    }
  })

  statePromise.metadata = metadataPromise
  return statePromise
}