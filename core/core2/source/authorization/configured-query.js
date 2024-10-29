import { environment } from './externals.js'
import * as postgres from './postgres.js'
import domainConfiguration from './domain-configuration.js'

const { MODE, ADMIN_DOMAIN } = environment

const domainAdmin = async () => false

//  TODO: consider using client connection id rather than user for query connection hashing key
export default async function (requestingDomain, targetDomain, queryName, params, user) {
  if (
    requestingDomain === ADMIN_DOMAIN
    && queryName !== 'current-config'
    && user === 'f74e9cb3-2b53-4c85-9b0c-f1d61b032b3f'
  ) {
    return postgres.query(targetDomain, queryName, params, user)
  }

  if (
    requestingDomain === ADMIN_DOMAIN
    && targetDomain !== requestingDomain
    && (MODE === 'local' || user === await domainAdmin(targetDomain))
  ) {
    //  TODO: ensure read-only client
    return postgres.query(targetDomain, queryName, params, user)
  }

  const configuration = await domainConfiguration(targetDomain)
  let queryDefinition


  const queryDefinitions = configuration?.postgres?.queries

  if (requestingDomain === targetDomain) {
    queryDefinition = queryDefinitions?.[queryName]
  }
  else if (queryDefinitions?.[queryName]?.domains?.includes(requestingDomain)) {
    queryDefinition = queryDefinitions[queryName]
  }

  let queryBody

  if (typeof queryDefinition === 'string') queryBody = queryDefinition
  else if (queryDefinition?.body) queryBody = queryDefinition.body

  if (queryBody) {
    const namedParams = { DOMAIN: targetDomain }
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

    return postgres.query(targetDomain, queryBody, queryParams, user).catch(error => {
      //  TODO: this type of error should probably make it to the admin interface
      console.warn('POSTGRES QUERY ERROR', requestingDomain, targetDomain, error)
      const e = new Error(error.fields?.message)
      e.code = error.fields?.code || 'Unknown Error Code'
      throw e
    })
  }
  else {
    const error = new Error(`No query named "${queryName}" in ${targetDomain}`)
    error.code = `INVALID QUERY '${queryName}' FOR '${targetDomain}'`
    throw error
  }
}
