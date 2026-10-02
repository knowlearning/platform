import { redisBatch } from './redis-batch.js'

const UUID_OWNER_HASH_KEY = '__knowlearning:uuid-owner-domain'
const DOMAIN_UUID_SET_PREFIX = '__knowlearning:domain-uuids:'

export function domainUUIDSetKey(domain) {
  return `${DOMAIN_UUID_SET_PREFIX}${domain}`
}

export function createUUIDOwnerIndex(client) {
  const cache = new Map()

  async function rememberOwner(id, domain) {
    if (!domain) throw new Error(`Missing owner for UUID ${id}`)
    await client.sAdd(domainUUIDSetKey(domain), id)
    cache.set(id, domain)
    return domain
  }

  async function ownerDomain(id) {
    if (cache.has(id)) return cache.get(id)
    const domain = await client.hGet(UUID_OWNER_HASH_KEY, id)
    return domain ? rememberOwner(id, domain) : null
  }

  async function claim(domain, id) {
    const claimed = await client.hSetNX(UUID_OWNER_HASH_KEY, id, domain)
    const owner = claimed ? domain : await client.hGet(UUID_OWNER_HASH_KEY, id)
    return rememberOwner(id, owner)
  }

  async function claimBatch(domain, ids) {
    if (ids.length === 0) return 0

    await redisBatch(client, ids, (pipeline, id) => {
      pipeline.hSetNX(UUID_OWNER_HASH_KEY, id, domain)
    })

    const owners = await client.hmGet(UUID_OWNER_HASH_KEY, ids)
    const groups = new Map()

    owners.forEach((owner, index) => {
      if (!owner) throw new Error(`Missing owner for UUID ${ids[index]}`)
      if (!groups.has(owner)) groups.set(owner, [])
      groups.get(owner).push(ids[index])
    })

    await redisBatch(client, [...groups], (pipeline, [owner, ownerIds]) => {
      pipeline.sAdd(domainUUIDSetKey(owner), ownerIds)
    })

    owners.forEach((owner, index) => cache.set(ids[index], owner))
    const conflict = owners.findIndex(owner => owner !== domain)
    if (conflict !== -1) {
      throw new Error(`UUID ${ids[conflict]} is owned by ${owners[conflict]}; refusing to copy for ${domain}`)
    }

    return ids.length
  }

  return { ownerDomain, claim, claimBatch }
}
