// Prep all other "Persistence backend" marked files so the only edits we'll need for multi-redis instance support can be made in this file

import { createRedisClient, environment } from './utils.js'

const {
  REDIS_SERVERS,
  REDIS_DOMAINS
} = environment

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
const redisDomains = parseJSONEnvironment('REDIS_DOMAINS', REDIS_DOMAINS)
const defaultRedisServer = redisDomains.default

if (!defaultRedisServer) throw new Error('REDIS_DOMAINS.default is required')
if (!redisServers[defaultRedisServer]) {
  throw new Error(`REDIS_DOMAINS.default references unknown Redis server "${defaultRedisServer}"`)
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

const connectionInfo = clientConnectionInfo(defaultRedisServer)
const client = createRedisClient(connectionInfo)
const subscriptions = createRedisClient(connectionInfo)

client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([
  client.connect(),
  subscriptions.connect()
]).then(() => console.log(`CONNECTED TO REDIS ${defaultRedisServer}!`))

export { client, subscriptions, connected }
