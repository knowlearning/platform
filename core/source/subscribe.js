import { subscriptionResponses } from './stateful.js'
import { subscribe } from './persistence.js'
import SESSION from './session.js'

function clientUpdate(update) {
  const { originServer, ...message } = update
  return message
}

//  TODO: clean up subscriptions when no more subscribers
export default function (id, callback, scope) {
  if (id === undefined) {
    console.log('UNDEFINED ID SUBSCRIBED TO', scope)
    return
  }

  if (!subscriptionResponses[id]) {
    subscriptionResponses[id] = []
    subscribe(id, message => {
      if (!subscriptionResponses[id]) subscriptionResponses[id] = []
      const update = JSON.parse(message)
      if (update.originServer === SESSION) return
      subscriptionResponses[id].forEach(cb => cb(update))
    })
  }

  const sendUpdate = update => {
    const message = clientUpdate(update)
    callback(scope ? { ...message, scope } : message) // if given, use subscriber's named scope in update
  }

  subscriptionResponses[id].push(sendUpdate)

  return async function unsubscribe() {
    const callbackIndex = subscriptionResponses[id].findIndex(cb => cb === sendUpdate)
    if (callbackIndex > -1) {
      subscriptionResponses[id].splice(callbackIndex, 1)
      if (subscriptionResponses[id].length === 0) {
        // TODO: check if passing undefined id results in unsubscribe of all channels
        //delete subscriptionResponses[id]
        //await subscriptions.unsubscribe(id)
      }
    }
  }
}
