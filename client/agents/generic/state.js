import MutableProxy from '../../persistence/json.js'

const SUBSCRIPTION_TYPE = 'application/json;type=subscription'

export default function(scope='[]', { keyToSubscriptionId, watchers, states, create, session, lastMessageResponse, lastInteractionResponse, tagIfNotYetTaggedInSession, interact }) {
  return new Promise(async (resolveState, rejectState) => {
    if (!keyToSubscriptionId[scope]) {
      const id = uuid()

      keyToSubscriptionId[scope] = id
      watchers[scope] = []
      states[scope] = new Promise(async (resolve, reject) => {
        create({
          id,
          active_type: SUBSCRIPTION_TYPE,
          active: { session, scope, ii: null, initialized: Date.now() },
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

    await lastInteractionResponse[scope]

    try {
      const state = structuredClone(await states[scope])

      resolveState(new MutableProxy(state.active || {}, patch => {
        const activePatch = structuredClone(patch)
        activePatch.forEach(entry => entry.path.unshift('active'))
        interact(scope, activePatch)
      }))
    }
    catch (error) {
      rejectState(error)
    }
  })
}