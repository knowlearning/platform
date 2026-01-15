import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD
} = environment

//  TODO: store in JSON in env


const REDIS_DATABASE_CREDENTIALS = {
  'thailand-ap-southeast-1': { HOST: REDIS_HOST, PORT: REDIS_PORT, PASSWORD: REDIS_PASSWORD },
  'default-us-east-1': { HOST: REDIS_HOST, PORT: REDIS_PORT, PASSWORD: REDIS_PASSWORD },
}

const scopeDomainCache = {
  'domain-config': 'core' // TODO relate the value to a client were that scope is held
}

const domainToDatabaseId = {
  'thailand.pilaproject.org': 'thailand-ap-southeast-1',
  default: 'default-us-east-1'
}




///////////////////////////////////////////////////////////////
//  TODO: getConnection for every entry in
//        REDIS_DATABASE_CREDENTIALS and store in
//        databaseIdToConnection cache
///////////////////////////////////////////////////////////////









const clientCache = {}

async function getConnection(databaseId) {
  if (clientCache[databaseId]) return clientCache[databaseId]

  const { HOST, PORT, PASSWORD } = REDIS_DATABASE_CREDENTIALS[databaseId]
  const connectionInfo = {
    socket: { host: HOST, port: PORT },
    password: PASSWORD
  }
  const client = createRedisClient(connectionInfo)
  const subscriptions = createRedisClient(connectionInfo)

  client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
  subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

  clientCache[databaseId] = (
    Promise
      .all([ client.connect(), subscriptions.connect() ])
      .then(() => ({ client, subscriptions }))
  )

  return clientCache[databaseId]
}

//  TODO: REPLACE ALL getConnection(domainToDatabaseId.default)

async function clientForScope(id) {
  const scopeDomain = scopeDomainCache[id]
  if (scopeDomain) return clientForDomain(scopeDomain)
  //  TODO: simultaneosly ask all clients for this id and return client that has it
  return getConnection(domainToDatabaseId.default).then(({ client }) => client)
}

async function clientForDomain(domain) {
  return getConnection(domainToDatabaseId.default).then(({ client }) => client)
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
  //  TODO: choose databaseId for connection based on location of server
  const { subscriptions } = await getConnection(domainToDatabaseId.default)
  return subscriptions.subscribe(id, cb)
}

async function idsInDomain(domain) {
  //  TODO: find client where this set is set to be able to make this request
  const { client } = await getConnection(domainToDatabaseId.default)
  return client.sendCommand(['smembers', domain])
}

async function publish(id, message) {
  //  TODO: publish to all domain clients
  const { client } = await getConnection(domainToDatabaseId.default)
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