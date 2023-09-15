import { validate, v4 as uuid } from 'uuid'
import initializationState from './initialization-state.js'
import * as redis from './redis.js'
import * as postgres from './postgres.js'
import metadataSideEffects from './side-effects/metadata.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, scope) {
  if (validate(scope)) return scope

  const mostRecentNamedScope = 'SELECT id FROM metadata WHERE domain = $1 AND name = $2 AND owner = $3 ORDER BY created DESC'
  let { rows: [response] } = await postgres.query(ADMIN_DOMAIN, mostRecentNamedScope, [domain, scope, user])

  if (response) return response.id

  const id = uuid()
  const state = initializationState(domain, user, scope)
  await redis.client.json.set(id, '$', state)
  await metadataSideEffects(id)

  return id
}
