import { validate as isUUID } from 'uuid'
import MutableProxy from '../../persistence/json.js'

const SUBSCRIPTION_TYPE = 'application/json;type=subscription'

export default function(scope='[]', user, { keyToSubscriptionId, watchers, states, create, environment, lastMessageResponse, lastInteractionResponse, tagIfNotYetTaggedInSession, interact }) {
  let resolveMetadataPromise
  let metadataPromise = new Promise(resolve => resolveMetadataPromise = resolve)

  const statePromise = new Promise(async (resolveState, rejectState) => {
    const qualifiedScope = isUUID(scope) ? scope : `${user || ''}/${scope}`
    console.log('State qualified scope', qualifiedScope)
    if (!keyToSubscriptionId[qualifiedScope]) {
      const id = uuid()

      keyToSubscriptionId[qualifiedScope] = id
      watchers[qualifiedScope] = []
      states[qualifiedScope] = new Promise(async (resolve, reject) => {
        const { session } = await environment()
        create({
          id,
          active_type: SUBSCRIPTION_TYPE,
          active: { session, scope, user, ii: null, initialized: Date.now() },
        })

        try {
          const state = await lastMessageResponse()
          tagIfNotYetTaggedInSession('subscribed', state.id)
          interact(id, [
            { op: 'add', path: ['active', 'ii'], value: state.ii }, // TODO: use state.ii when is coming down properly...
            { op: 'add', path: ['active', 'synced'], value: Date.now() }
          ])

          resolve(state)
        }
        catch (error) { reject(error) }
      })
    }

    await lastInteractionResponse[qualifiedScope]

    try {
      const data = structuredClone(await states[qualifiedScope])
      console.log('DATA----------', data)
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