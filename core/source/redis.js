import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD
} = environment

const clientConnectionInfo = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_PASSWORD
}

const client = createRedisClient(clientConnectionInfo)
const subscriptions = createRedisClient(clientConnectionInfo)

client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([
  client.connect(),
  subscriptions.connect()
]).then(() => console.log('CONNECTED!'))

async function setScope(id, path, state, options) {
  await connected
  return client.json.set(id, path, state, options)
}

async function getScope(id, options) {
  await connected
  return client.json.get(id, options)
}

async function scopeExists(id) {
  await connected
  return client.exists(id)
}

async function subscribe(id, cb) {
  await connected
  return subscriptions.subscribe(id, cb)
}

async function idsInDomain(domain) {
  await connected
  return client.sendCommand(['smembers', domain])
}

async function publish(id, message) {
  await connected
  return client.publish(id, message)
}

async function scopeTransaction(domain) {
  await connected
  return client.multi()
}

async function setKey(id, value, options) {
  await connected
  return client.set(id, value, options)
}

export {
  scopeExists,
  setKey,
  setScope,
  getScope,
  publish,
  subscribe,
  idsInDomain,
  scopeTransaction
}