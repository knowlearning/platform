import { isUUID, uuid } from './utils.js'
import initializationState from './initialization-state.js'
import * as redis from './redis.js'
import * as postgres from './postgres.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import sync from './interact/sync.js'
import { publishInitializationIfNecessary } from './pubsub.js'

const MOST_RECENT_NAMED_SCOPE_QUERY = `
  SELECT id
  FROM metadata
  WHERE domain = $1
    AND name = $2
    AND owner = $3
  ORDER BY created
  DESC
`
const cache = {}

function cacheScope(domain, user, scope, id) {
  if (!cache[domain]) cache[domain] = {[user]:{[scope]:id}}
  else if (!cache[domain][user]) cache[domain][user] = {[scope]:id}
  else if (!cache[domain][user][scope]) cache[domain][user][scope] = id
}

export default async function scopeToId(domain, user, scope) {
  if (cache?.[domain]?.[user]?.[scope]) return cache[domain][user][scope]

  await ensureDomainConfigured(domain)

  if (isUUID(scope)) {
    await publishInitializationIfNecessary(scope, scope, user, domain)
    if (await redis.client.exists(scope)) return scope

    const state = initializationState(domain, user, scope)
    await redis.client.json.set(scope, '$', state, { NX: true })
    await sync(domain, user, state.active_type, scope)
    return scope
  }

  const { rows: [response] } = await postgres.query(domain, MOST_RECENT_NAMED_SCOPE_QUERY, [domain, scope, user])

  if (response) {
    cacheScope(domain, user, scope, response.id)
    await publishInitializationIfNecessary(response.id, scope, user, domain)
    return response.id
  }
  else {
    const id = uuid()
    cacheScope(domain, user, scope, id)
    const state = initializationState(domain, user, scope)
    await redis.client.json.set(id, '$', state)
    await publishInitializationIfNecessary(id, scope, user, domain)
    await sync(domain, user, state.active_type, id)
    return id
  }
}
