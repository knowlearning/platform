import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD,
  REDIS_DATABASE_CREDENTIALS
} = environment

const scopeDomainCache = {
  'domain-config': 'core' // TODO relate the value to a client were that scope is held
}

const domainToDatabaseConfig = {
  'thailand.pilaproject.org': 'ap-southeast-1',
  default: 'us-east-1'
}




///////////////////////////////////////////////////////////////
//  TODO: create a client/subscription for every entry in
//        REDIS_DATABASE_CREDENTIALS
///////////////////////////////////////////////////////////////

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

const clientConnection = client.connect()
const subscriptionsConnection = subscriptions.connect()







async function clientForScope(id) {
  const scopeDomain = scopeDomainCache[id]
  if (scopeDomain) return clientForDomain(scopeDomain)
  //  TODO: simultaneosly ask all clients for this id and return client that has it
  await clientConnection
  return client
}

async function clientForDomain(domain) {
  await clientConnection
  return client
}

async function setScope(id, path, state, options) {
  //  TODO: use domain to choose client
  const client = await clientForScope(id)
  return client.json.set(id, path, state, options)
}

async function getScope(id, options) {
  const client = await clientForScope(id)
  return client.json.get(id, options)
}

async function scopeExists(id) {
  if (scopeDomainCache[id]) return true

  const client = await clientForScope(id)
  return client?.exists(id) || false
}

async function subscribe(id, cb) {
  //  TODO: choose subscription client to subscribe to based on location of server
  await subscriptionsConnection
  return subscriptions.subscribe(id, cb)
}

async function idsInDomain(domain) {
  //  TODO: find client where this set is set to be able to make this request
  await clientConnection
  return client.sendCommand(['smembers', domain])
}

async function publish(id, message) {
  //  TODO: publish to all domain clients
  await clientConnection
  return client.publish(id, message)
}

async function scopeTransaction(domain) {
  const client = await clientForDomain(domain)
  return client.multi()
}

async function setKey(domain, id, value, options) {
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