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

async function getJSON(key, path='$') {
  const c = await client
  const reply = JSON.parse(await c.sendCommand('JSON.get', [key, path]))
  console.log('GET JSON REPLY', key, path, reply)
  return reply ? reply[0] : reply
}


const subscriptionResponses = {}

//  TODO: clean up subscriptions when no more subscribers
function subscribe(id, callback, scope) {
  if (!subscriptionResponses[id]) {
    subscriptionResponses[id] = []
    subscriptions
      .then(async c => {
        const subscription = await c.subscribe(id)
        for await (const { channel, message } of subscription.receive()) {
          try {
            const update = JSON.parse(message)
            subscriptionResponses[id].forEach(cb => cb(update))
          }
          catch (error) {
            console.warn('ERROR on subscription response', error)
          }
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

async function setJSON(key, path, value, condition) {
  try {
    const args = [key, path, JSON.stringify(value)]
    if (condition) args.push(condition)
    const c = await client
    return await c.sendCommand('JSON.SET', args)
  }
  catch (error) {
    console.log('Error setting JSON', key, path, value, condition)
    throw error
  }
}

async function getSet(key) {
  try {
    const c = await client
    return await c.sendCommand('SMEMBERS', [key])
  }
  catch (error) {
    console.log('Error getting Set', key)
    throw error
  }
}

async function transaction() {
  const c = await client
  return c.pipeline()
}

async function publish(channel, message) {
  const c = await client
  return c.sendCommand('PUBLISH', [message])
}

async function exists(key) {
  const c = await client
  console.log('EXISSSSSSSSSSSSSSSSSSSSSSTS??????????????????', await c.sendCommand('EXISTS', [key]))
  return c.sendCommand('EXISTS', [key])
}

export {
  client,
  publish,
  subscribe,
  subscriptions,
  connected,
  getJSON,
  setJSON,
  getSet,
  transaction,
  exists
}