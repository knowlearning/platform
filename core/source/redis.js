import { createRedisClient, environment, getRegionId } from './utils.js'

const { REGION } = environment
const REDIS_CREDENTIALS = JSON.parse(environment.REDIS_CREDENTIALS)

const scopeDomainCache = {
  'domain-config': 'core' // TODO relate the value to a client were that scope is held
}

const domainToDatabaseId = {
  'thailand.pilaproject.org': 'thailand-ap-southeast-1',
  default: 'default-us-east-1'
}

const regionToDatabaseId = {
  'ap-southeast-1': 'thailand-ap-southeast-1',
  default: 'default-us-east-1'
}

const DEFAULT_DATABASE_ID = 'default-us-east-1'

const connections = {}

Object
  .keys(REDIS_CREDENTIALS)
  .forEach(getConnection)

async function getConnection(databaseId) {
  if (connections[databaseId]) return connections[databaseId]

  const { host, port, password } = REDIS_CREDENTIALS[databaseId]
  const connectionInfo = {
    socket: {
      host,
      port
    },
    password
  }
  const client = createRedisClient(connectionInfo)
  const subscriptions = createRedisClient(connectionInfo)

  client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
  subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

  connections[databaseId] = (
    Promise
      .all([
        client.connect(),
        subscriptions.connect()
      ])
      .then(() => ({ client, subscriptions }))
  )

  return connections[databaseId]
}

//  TODO: REPLACE ALL getConnection(domainToDatabaseId.default)

const scopeClientCache = {}

async function clientForScope(id) {
  if (scopeClientCache[id]) return scopeClientCache[id]

  let resolve, reject

  scopeClientCache[id] = new Promise((res, rej) => {
    resolve = res
    reject = rej
  })

  const databaseId = await Promise
    .any(
      Object
        .entries(connections)
        .map(async ([databaseId, connectionPromise]) => {
          const connection = await connectionPromise
          if (await connection.client.exists(id)) return databaseId
          else throw new Error('No client')
        })
    )
    .catch(() => {
      console.warn(`No client for scope ${id}`)
      return null
    })

  if (databaseId) {
    const client = await getConnection(databaseId).then(({ client }) => client)
    resolve(client)
    return client
  }
  else {
    delete scopeClientCache[id]
    resolve(null)
    return null
  }
}

async function clientForDomain(domain) {
  const databaseId = domainToDatabaseId[domain] || domainToDatabaseId.default
  return getConnection(databaseId).then(({ client }) => client)
}

async function setScope(domain, id, path, state, options) {
  let client = await clientForScope(id) || await clientForDomain(domain)
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
  const regionId = await getRegionId() || 'default'
  const databaseId = regionToDatabaseId[regionId] || DEFAULT_DATABASE_ID
  const { subscriptions } = await getConnection(databaseId)
  return subscriptions.subscribe(id, cb)
}

async function idsInDomain(domain) {
  //  TODO: find client where this set is set to be able to make this request
  const { client } = await getConnection(DEFAULT_DATABASE_ID)
  return client.sendCommand(['smembers', domain])
}

//  TODO: guard against multiple publishes to same client
async function publish(id, message) {
  return Promise.all(
    Object
      .values(connections)
      .map(async connectionPromise => {
        const { client } = await connectionPromise
        return client.publish(id, message)
      })
  )
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