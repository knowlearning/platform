import { createRedisClient, environment } from './utils.js'

const {
  MODE,
  REDIS_HOST,
  REDIS_PORT,
  REDIS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

const clientConnectionInfo = {
  hostname: REDIS_HOST,
  port: REDIS_PORT,
  password: MODE === 'local' ? undefined : REDIS_SERVICE_ACCOUNT_CREDENTIALS
}

const client = createRedisClient(clientConnectionInfo)
const subscriptions = createRedisClient(clientConnectionInfo)

//client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
//subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([ client, subscriptions ]).then(() => console.log('CONNECTED!'))

async function getJSON(key, path) {
  const c = await client
  const reply = await c.sendCommand('JSON.get', key, path)
  console.log('GET JSON REPLY', reply)
  return JSON.parse(reply[0])
}


const subscriptionResponses = {}

//  TODO: clean up subscriptions when no more subscribers
function subscribe(id, callback, scope) {
  if (!subscriptionResponses[id]) {
    subscriptionResponses[id] = []
    subscriptions
      .then(async c => {
        const subscription = c.subscribe(id)
        for await (const { channel, message } of subscription.receive()) {
            const update = JSON.parse(message)
            subscriptionResponses[id].forEach(cb => cb(update))
        }
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

export { client, subscriptions, subscribe, connected, getJSON }