import * as postgres from '../postgres.js'
import configuration, { domainAdmin } from '../configuration.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, _session, patch, si, ii, send) {
  const config = await configuration(domain)

  const { op, path, value: { query, params=[], domain:targetDomain=domain } } = patch[0]

  if (op !== 'add' || path.length !== 1 || path[0] !== 'active') return send({ si, ii })

  if (domain === ADMIN_DOMAIN && targetDomain !== domain && user === await domainAdmin(targetDomain)) {
    //  TODO: ensure read-only client
    return (
      postgres
        .query(targetDomain, query, params, true)
        .then(({rows, fields}) => send({ si, ii, rows, columns: fields.map(f => f.name) }))
        .catch(error => send({ si, error: error.code }))
    )
  }
  else if (config?.postgres?.scopes?.[query]) {
      let queryBody = config?.postgres?.scopes?.[query]
      const namedParams = {
        REQUESTER: user
      }
      //  TODO: better replacement technique
      const queryParams = [...params]
      Object
        .entries(namedParams)
        .forEach(([param, value]) => {
          if (queryBody.includes(`$${param}`)) {
            queryParams.push(value)
            queryBody = queryBody.replaceAll(`$${param}`, `$${queryParams.length}`)
          }
        })

      return (
        postgres
          .query(targetDomain, queryBody, queryParams, true)
          .then(({rows, fields}) => send({ si, ii, rows, columns: fields.map(f => f.name) }))
          .catch(error => send({ si, error: error.code }))
      )
  }
  else throw new Error(`No query named "${query}" in ${targetDomain}`)

}
