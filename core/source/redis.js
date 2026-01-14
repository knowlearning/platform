import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD
} = environment

const scopeDomainCache = {
  'domain-config': 'core' // TODO relate the value to a client were that scope is held
}

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

async function clientForScope(id) {
  const scopeDomain = scopeDomainCache[id]
  if (scopeDomain) return clientForDomain(scopeDomain)
  //  TODO: simultaneosly ask all clients for this id and return client that has it
  return client
}

async function clientForDomain(domain) {
  return client
}

async function setScope(domain, id, path, state, options) {
  await connected
  //  TODO: use domain to choose client
  return client.json.set(id, path, state, options)
}

async function getScope(id, options) {
  await connected
  const client = await clientForScope(id)
  return client.json.get(id, options)
}

async function scopeExists(id) {
  await connected
  if (scopeDomainCache[id]) return true

  const client = await clientForScope(id)
  return client?.exists(id) || false
}

async function subscribe(id, cb) {
  await connected
  //  TODO: choose subscription client to subscribe to based on location of server
  return subscriptions.subscribe(id, cb)
}

async function idsInDomain(domain) {
  await connected
  //  TODO: find client where this set is set to be able to make this request
  return client.sendCommand(['smembers', domain])
}

async function publish(id, message) {
  await connected
  //  TODO: publish to all domain clients
  return client.publish(id, message)
}

async function scopeTransaction(domain) {
  await connected
  const client = await clientForDomain(domain)
  return client.multi()
}

async function setKey(domain, id, value, options) {
  await connected
  const client = await clientForDomain(domain)
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