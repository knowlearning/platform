import { isUUID, uuid, environment } from './utils.js'
import initializationState from './initialization-state.js'
import * as redis from './redis.js'
import * as postgres from './postgres.js'
import sync from './interact/sync.js'

const { ADMIN_DOMAIN } = environment

export default async function (domain, user, scope) {
  if (isUUID(scope)) {
    if (await redis.client.exists(scope)) return scope

    const state = initializationState(domain, user, scope)
    await redis.client.json.set(scope, '$', state, { NX: true })
    await sync(domain, user, scope)
    return scope
  }

  const mostRecentNamedScope = 'SELECT id FROM metadata WHERE domain = $1 AND name = $2 AND owner = $3 ORDER BY created DESC'
  let { rows: [response] } = await postgres.query(domain, mostRecentNamedScope, [domain, scope, user])

  if (response) return response.id

  const id = uuid()
  const state = initializationState(domain, user, scope)
  await redis.client.json.set(id, '$', state)
  await sync(domain, user, id)

  return id
}
