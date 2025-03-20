import { subscriptions, connected } from './redis.js'

const subscriptionResponses = {}

//  TODO: clean up subscriptions when no more subscribers
export default function subscribe(id, callback, scope) {
  if (!subscriptionResponses[id]) {
    subscriptionResponses[id] = []
    connected
      .then(() => {
        subscriptions
          .subscribe(id, message => {
            const update = JSON.parse(message)
            subscriptionResponses[id].forEach(cb => cb(update))
          })
      })
  }

  const sendUpdate = update => {
    if (scope) update = { ...update, scope } // if given, use subscriber's named scope in update
    callback(update)
  }

  subscriptionResponses[id].push(sendUpdate)

  return async function unsubscribe() {
    const callbackIndex = subscriptionResponses[id].findIndex(cb => cb === sendUpdate)
    if (callbackIndex > -1) {
      subscriptionResponses[id].splice(callbackIndex, 1)
      if (subscriptionResponses[id].length === 0) {
        delete subscriptionResponses[id]
        // TODO: check if passing undefined id results in unsubscribe of all channels
        //await subscriptions.unsubscribe(id)
      }
    }
  }
}
