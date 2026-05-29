// Global State - key file for ensuring ids land in the right place and are pulled from the right place

import { isUUID, uuid, environment } from './utils.js'
import initializationState from './initialization-state.js'
import { claimStateOwner, setState, stateExists } from './persistence.js'
import * as postgres from './postgres.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import sync from './sync.js'
import { scopeToIdCache as cache } from './stateful.js'

const { ADMIN_DOMAIN } = environment

const MOST_RECENT_NAMED_SCOPE_QUERY = `
  SELECT id
  FROM metadata
  WHERE domain = $1
    AND name = $2
    AND owner = $3
  ORDER BY created
  DESC
`

function cacheScope(domain, user, scope, id) {
  if (!cache[domain]) cache[domain] = {[user]:{[scope]:id}}
  else if (!cache[domain][user]) cache[domain][user] = {[scope]:id}
  else if (!cache[domain][user][scope]) cache[domain][user][scope] = id
}

export default async function scopeToId(domain, user, scope) {
  if (cache?.[domain]?.[user]?.[scope]) return cache[domain][user][scope]

  await ensureDomainConfigured(domain)

  if (isUUID(scope)) {
    const ownerDomain = await claimStateOwner(domain, scope)
    if (ownerDomain !== domain) return scope
    if (await stateExists(domain, scope)) return scope

    const state = initializationState(domain, user, scope)
    await setState(domain, scope, '$', state, { NX: true })
    await sync(domain, user, state.active_type, scope)
    return scope
  }

  const { rows: [response] } = await postgres.query(domain, MOST_RECENT_NAMED_SCOPE_QUERY, [domain, scope, user])

  if (response) {
    const ownerDomain = await claimStateOwner(domain, response.id)
    if (ownerDomain !== domain) {
      throw new Error(`Named scope ${scope} resolved to UUID ${response.id} owned by ${ownerDomain}`)
    }
    cacheScope(domain, user, scope, response.id)
    return response.id
  }
  else {
    const id = uuid()
    cacheScope(domain, user, scope, id)
    const state = initializationState(domain, user, scope)
    await setState(domain, id, '$', state)
    await sync(domain, user, state.active_type, id)
    return id
  }
}
