import * as redis from './redis.js'

export async function getState(id, options) {
  await redis.connected
  return redis.client.json.get(id, options)
}

export async function batchGetState(ids, options) {
  await redis.connected
  const transaction = redis.client.multi()
  ids.forEach(id => transaction.json.get(id, options))
  return await transaction.exec()
}

export async function setState(id, path, value, options) {
  await redis.connected
  return redis.client.json.set(id, path, value, options)
}

export async function stateExists(id) {
  await redis.connected
  return redis.client.exists(id)
}

export async function domainIds(domain) {
  await redis.connected
  return redis.client.sendCommand(['smembers', domain])
}

export async function subscribe(id, callback) {
  await redis.connected
  return redis.subscriptions.subscribe(id, callback)
}

export async function publish(id, message) {
  await redis.connected
  await (
    redis
      .client
      .publish(id, JSON.stringify(message))
      .catch(error => console.log('ERROR PUBLISHING!!!!!!!!', id, message))
  )
}