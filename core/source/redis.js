import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

const clientConnectionInfo = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_SERVICE_ACCOUNT_CREDENTIALS
}

const client = createRedisClient(clientConnectionInfo)
const subscriptions = createRedisClient(clientConnectionInfo)

//client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
//subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([
  client,
  subscriptions
]).then(() => console.log('CONNECTED!'))

async function getJSON(key) {
  const c = await client
  return c.json.get(key)
}

export { client, subscriptions, connected, getJSON }