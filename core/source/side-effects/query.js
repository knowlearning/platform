import * as postgres from '../postgres.js'
import configuration, { domainAdmin } from '../configuration.js'
import interact from '../interact/index.js'

const { MODE, ADMIN_DOMAIN } = process.env

export default async function ({ domain, user, session, scope, patch, si, ii, send }) {
  for (let index = 0; index < patch.length; index++) {
    const { op, path, value: { query, params=[], domain:targetDomain=domain } } = patch[index]

    if (op !== 'add' || path.length !== 1 || path[0] !== 'active') continue

    if (domain === ADMIN_DOMAIN && targetDomain !== domain && ( MODE === 'local' || user === await domainAdmin(targetDomain))) {
      //  TODO: ensure read-only client
      return (
        postgres
          .query(targetDomain, query, params, true)
          .then(({rows, fields}) => send({ si, ii, rows, columns: fields.map(f => f.name) }))
          .catch(error => send({ si, error: error.code }))
      )
    }
    else {
      const config = await configuration(targetDomain)
      const sameDomain = targetDomain === domain
      let queryBody

      if (sameDomain) queryBody = config?.postgres?.scopes?.[query]
      else if (config?.postgres?.crossDomainQueries?.[query]?.domains?.includes(domain)) {
        queryBody = config?.postgres?.crossDomainQueries?.[query]?.body
      }

      if (queryBody) {
        const namedParams = {
          REQUESTER: user,
          DOMAIN: targetDomain
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

        const queryStart = Date.now()
        return (
          postgres
            .query(targetDomain, queryBody, queryParams, true)
            .then(({rows, fields}) => {
              interact(domain, user, scope, [{
                op: 'add',
                path: ['active', 'db_latency'],
                value: Date.now() - queryStart
              }])
              send({ si, ii, rows, columns: fields.map(f => f.name) })
            })
            .catch(error => send({ si, error: error.code }))
        )
      }
      else throw new Error(`No query named "${query}" in ${targetDomain}`)
    }
  }

  send({ si, ii })
}
