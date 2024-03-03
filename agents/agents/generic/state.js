import { v4 as uuid, validate as isUUID } from 'uuid'
import MutableProxy from '../../persistence/json.js'

export default function(scope='[]', user, domain, { keyToSubscriptionId, watchers, states, create, environment, lastMessageResponse, lastInteractionResponse, tagIfNotYetTaggedInSession, interact, log }) {
  let resolveMetadataPromise
  let metadataPromise = new Promise(resolve => resolveMetadataPromise = resolve)

  const statePromise = new Promise(async (resolveState, rejectState) => {
    const qualifiedScope = isUUID(scope) ? scope : `${domain || ''}/${user || ''}/${scope}`
    if (!keyToSubscriptionId[qualifiedScope]) {
      const id = uuid()

      keyToSubscriptionId[qualifiedScope] = id
      watchers[qualifiedScope] = []
      states[qualifiedScope] = new Promise(async (resolve, reject) => {
        const { session } = await environment()
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

    log('AWAITING LAST INTERACTION', qualifiedScope)
    await lastInteractionResponse[qualifiedScope]
    log('GOT LAST INTERACTION', qualifiedScope)

    try {
      log('GETTING STATE FOR', qualifiedScope)
      const data = structuredClone(await states[qualifiedScope])
      log('GOT STATE FOR', qualifiedScope)
      const active = data.active
      delete data.active
      resolveMetadataPromise(data)
      resolveState(new MutableProxy(active || {}, patch => {
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