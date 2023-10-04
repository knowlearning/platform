import * as postgres from '../postgres.js'
import configuration from '../configuration.js'

const { ADMIN_DOMAIN } = process.env

export default async function (domain, user, _session, patch, si, ii, send) {
  const config = await configuration(domain)

  const { op, path, value: { query: queryName, params=[] } } = patch[0]

  if (op !== 'add' || path.length !== 1 || path[0] !== 'active') return send({ si, ii })
console.log('CONFIG!!!!!!!!!!!!!!!!', config)
  if (config?.postgres?.scopes?.[queryName]) {
      let query = config?.postgres?.scopes?.[queryName]
      const namedParams = {
        REQUESTER: user
      }
      //  TODO: better replacement technique
      const queryParams = [...params]
      Object
        .entries(namedParams)
        .forEach(([param, value]) => {
          if (query.includes(`$${param}`)) {
            queryParams.push(value)
            query = query.replaceAll(`$${param}`, `$${queryParams.length}`)
          }
        })

      return (
        postgres
          .query(domain, query, queryParams, true)
          .then(({rows, fields}) => send({ si, ii, rows, columns: fields.map(f => f.name) }))
          .catch(error => send({ si, error: error.code }))
      )
  }
  else throw new Error(`No query named "${queryName}" in ${domain}`)

}
