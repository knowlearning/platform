import * as redis from '../redis.js'
import scanRedis from './scan-redis.js'


const domainSizes = {}

scanRedis('0', '*', 1000, async key => {
  const [domain] = await redis.client.json.get(key, { path: [`$.domain`] })
  if (!domainSizes[domain]) domainSizes[domain] = 0
  domainSizes[domain] += (await redis.client.sendCommand(['JSON.DEBUG', 'MEMORY', key]))[0] || 0
})
.then(() => {
  console.log('DOMAIN SIZES', domainSizes)
})

