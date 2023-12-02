import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'

const { MODE, ADMIN_DOMAIN } = process.env

export default async function (requestingDomain, targetDomain, queryName, params, user) {
  if (requestingDomain === ADMIN_DOMAIN && targetDomain !== requestingDomain && ( MODE === 'local' || user === await domainAdmin(targetDomain))) {
    //  TODO: ensure read-only client
    return postgres.query(targetDomain, queryName, params, true)
  }

  const config = await configuration(targetDomain)
  let queryBody

  if (requestingDomain === targetDomain) queryBody = config?.postgres?.scopes?.[queryName]
  else if (config?.postgres?.crossDomainQueries?.[queryName]?.domains?.includes(requestingDomain)) {
    queryBody = config?.postgres?.crossDomainQueries?.[queryName]?.body
  }

  if (queryBody) {
    const namedParams = {
      DOMAIN: targetDomain
    }
    if (user) namedParams.REQUESTER = user
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

    return postgres.query(targetDomain, queryBody, queryParams, true)
  }
  else throw new Error(`No query named "${queryName}" in ${targetDomain}`)
}
