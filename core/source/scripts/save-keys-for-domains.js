import * as redis from '../redis.js'
import scanRedis from './scan-redis.js'

const localhostRegex = /^(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/
const domainRegex = /^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,7}$/;
const isValidDomain = d => localhostRegex.test(d) || domainRegex.test(d)

scanRedis('0', '*', 1000, async key => {
  const [domain] = await redis.client.json.get(key, { path: [`$.domain`] })
  if (isValidDomain(domain)) {
    await redis.client.sendCommand(['sadd', domain, key])
    await redis.client.sendCommand(['sadd', 'domains', domain])
  }
  else console.warn('INVALID DOMAIN', key, domain)
})

