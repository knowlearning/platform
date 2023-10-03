import { validate as isUUID, v4 as uuid } from 'uuid'
import initializationState from './initialization-state.js'
import * as redis from './redis.js'
import * as postgres from './postgres.js'
import sync from './interact/sync.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, scope) {
  if (isUUID(scope)) return scope

  const mostRecentNamedScope = 'SELECT id FROM metadata WHERE domain = $1 AND name = $2 AND owner = $3 ORDER BY created DESC'
  let { rows: [response] } = await postgres.query(domain, mostRecentNamedScope, [domain, scope, user])

  if (response) return response.id

  const id = uuid()
  const state = initializationState(domain, user, scope)
  await redis.client.json.set(id, '$', state)
  await sync(domain, user, id)

  return id
}
