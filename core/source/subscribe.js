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
  subscriptionResponses[id].push(update => {
    // if given, use subscriber's named scope in update
    if (scope) update = { ...update, scope }
    callback(update)
  })
  return function unsubscribe() {
    //  TODO: unsubscribe logic
  }
}
