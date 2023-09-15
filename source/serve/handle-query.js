import { query } from './postgres.js'

export default async function (config, domain, user, scope) {
  //  TODO: support cross user and cross domain requests with appropriate authorization checks
  //  TODO: consider reactive update possibilities

  //  TODO: more reliable replacement
  const namedParams = ['REQUESTER']
  let q = config.postgres.scopes[scope]
  const params = []
  namedParams.forEach(param => {
    if (q.includes(`$${param}`)) {
      params.push(user)
      q = q.replaceAll(`$${param}`, `$${params.length}`)
    }
  })

  return query(domain, q, params)
}