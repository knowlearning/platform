import * as redis from '../redis.js'
import scanRedis from './scan-redis.js'

const TYPE_TO_DELETE = 'application/json;type=postgres-query'

//  delete domain data keys
scanRedis('0', '*', 1000, async function (key) {
  const [ type ] = await redis.client.json.get(key, { path: [`$.active_type`] })
  if (type === TYPE_TO_DELETE) await redis.client.del(key)
})