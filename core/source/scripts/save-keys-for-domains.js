import scanRedis from './scan-redis.js'

const localhostRegex = /^(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/
const domainRegex = /^((?!-)[A-Za-z0-9-]{1,63}(?<!-)\.)+[A-Za-z]{2,6}$/;
const isValidDomain = d => localhostRegex.test(d) || domainRegex.test(d)

scanRedis('0', '*', 1000, async key => {
  const domain = await redis.client.json.get(key, { path: [`$.domain`] })
  if (isValidDomain(domain)) {
    const multi = redis.client.multi()
    multi.sadd(domain, key)
    multi.sadd('domains', domain)
    await multi.exec()
  }
  else console.warn('INVALID DOMAIN', key, domain)
})

