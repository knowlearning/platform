import * as redis from './redis.js'

export async function getState(id, options) {
  await redis.connected
  return redis.client.json.get(id, options)
}

export async function setState(id, path, value, options) {
  await redis.connected
  return redis.client.json.set(id, path, value, options)
}

export async function stateExists(id) {
  await redis.connected
  return redis.client.exists(id)
}