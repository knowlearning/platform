import { createRedisClient, environment } from './utils.js'
import { DEFAULT_STORAGE_SERVER, storageServerForDomain } from './storage-routing.js'

const { REDIS_SERVERS, REDIS_SUBSCRIPTION_SERVER } = environment

function parseJSONEnvironment(name, value) {
  if (!value) throw new Error(`${name} is required`)

  try {
    const parsed = JSON.parse(value)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }

    return parsed
  }
  catch (error) {
    throw new Error(`${name} must be valid JSON object: ${error.message}`)
  }
}

const redisServers = parseJSONEnvironment('REDIS_SERVERS', REDIS_SERVERS)
const defaultRedisServer = DEFAULT_STORAGE_SERVER
const subscriptionRedisServer = REDIS_SUBSCRIPTION_SERVER || defaultRedisServer

if (!redisServers[defaultRedisServer]) {
  throw new Error(`REDIS_SERVERS.${defaultRedisServer} is required`)
}

if (!redisServers[subscriptionRedisServer]) {
  throw new Error(`REDIS_SUBSCRIPTION_SERVER "${subscriptionRedisServer}" is not defined in REDIS_SERVERS`)
}

function clientConnectionInfo(serverName) {
  const server = redisServers[serverName]

  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    throw new Error(`REDIS_SERVERS.${serverName} must be a connection info object`)
  }

  const {
    host,
    port,
    password,
    user,
    username
  } = server

  const parsedPort = Number(port)

  if (!host) throw new Error(`REDIS_SERVERS.${serverName}.host is required`)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`REDIS_SERVERS.${serverName}.port must be a positive integer`)
  }

  const info = {
    socket: { host, port: parsedPort }
  }

  if (password !== undefined) info.password = password
  if (username || user) info.username = username || user

  return info
}

const clients = Object.fromEntries(
  Object
    .keys(redisServers)
    .map(serverName => [
      serverName,
      createRedisClient(clientConnectionInfo(serverName))
    ])
)

const client = clients[defaultRedisServer]
const subscriptions = createRedisClient(clientConnectionInfo(subscriptionRedisServer))

Object
  .entries(clients)
  .forEach(([serverName, client]) => {
    client.on('error', e => console.warn(`ERROR CONNECTING TO REDIS ${serverName}`, e.toString()))
  })
subscriptions.on('error', e => console.warn(`ERROR CONNECTING TO REDIS SUBSCRIPTIONS ${subscriptionRedisServer}`, e.toString()))

const connected = Promise.all([
  ...Object.values(clients).map(client => client.connect()),
  subscriptions.connect()
]).then(() => console.log(
  `CONNECTED TO REDIS ${Object.keys(clients).join(', ')}! SUBSCRIPTIONS ${subscriptionRedisServer}`
))

function serverNameForDomain(domain) {
  return storageServerForDomain(domain, 'redis')
}

function clientForServer(serverName) {
  const client = clients[serverName]
  if (!client) throw new Error(`Unknown Redis server "${serverName}"`)
  return client
}

function clientForDomain(domain) {
  return clientForServer(serverNameForDomain(domain))
}

function commandClients() {
  return Object
    .entries(clients)
    .map(([serverName, client]) => ({ serverName, client }))
}

async function publishAll(channel, message) {
  await connected

  const results = await Promise.allSettled(
    commandClients().map(async ({ serverName, client }) => {
      await client.publish(channel, message)
      return serverName
    })
  )

  results.forEach(result => {
    if (result.status === 'rejected') {
      console.log('ERROR PUBLISHING TO REDIS', channel, result.reason)
    }
  })
}

export {
  client,
  subscriptions,
  connected,
  defaultRedisServer,
  subscriptionRedisServer,
  serverNameForDomain,
  clientForDomain,
  clientForServer,
  commandClients,
  publishAll
}
