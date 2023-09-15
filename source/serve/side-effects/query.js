//  TODO: actually put this in side-effect pipeline instead of one-off import in handle-ws.js

import * as postgres from '../postgres.js'
import configuration from '../configuration.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, _session, patch, si, ii, send) {
  const { op, path, value } = patch[0]
  if (op !== 'add' || path.length !== 1 || path[0] !== 'active') throw new Error('Invalid query')
  if (domain !== ADMIN_DOMAIN) throw new Error('Postgres queries only valid on admin domain')

  const { domain: queryDomain, query, params } = value
  const config = await configuration(queryDomain)

  if (!config || !config.postgres) throw new Error(`Postgres not configured for ${queryDomain}`)
  if (config.admin !== user) throw new Error('Only a domain admin can execute arbitrary queries')

  const { rows, fields } = await postgres.query(queryDomain, query, params, true)

  send({ si, ii, rows, columns: fields.map(f => f.name) })
}
