//  TODO: actually put this in side-effect pipeline instead of one-off import in handle-ws.js

import * as postgres from '../postgres.js'
import configuration from '../configuration.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, _session, patch, si, ii, send) {
  const config = await configuration(domain)

  const { op, path, value: { query: queryName, params } } = patch[0]

  if (op !== 'add' || path.length !== 1 || path[0] !== 'active') throw new Error('Invalid query')

  if (config?.postgres?.scopes?.[queryName]) {
      const queryImplementation = config?.postgres?.scopes?.[queryName]
      return (
        postgres
          .query(domain, queryImplementation, params, true)
          .then(({rows, fields}) => send({ si, ii, rows, columns: fields.map(f => f.name) }))
          .catch(error => send({ si, error: error.code }))
      )
  }
  else throw new Error(`Postgres not configured for ${domain}`)

}
