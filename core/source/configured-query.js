import { environment } from './utils.js'
import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'
import { pg } from './utils.js'
import { schemaCache } from './stateful.js'

const {
  MODE,
  ADMIN_DOMAIN,
  POSTGRES_HOST,
  POSTGRES_PORT
} = environment

const CLIENT_CLEANUP_THRESHOLD = 30_000

setInterval(() => {
  Object.entries(schemaCache).map(async ([schema, p]) => {
    const { used, username, domain, client } = await p
    if (used + CLIENT_CLEANUP_THRESHOLD < Date.now()) {
      await client.end()
      await postgres.query(domain, `DROP OWNED BY ${username} CASCADE`);
      await postgres.query(domain, `DROP ROLE IF EXISTS ${username}`)
      delete schemaCache[schema]
    }
  })

}, 1_000)

export default async function (requestingDomain, targetDomain, queryName, params, user, context=[]) {
  if (
    requestingDomain === ADMIN_DOMAIN
    && queryName !== 'current-config'
    && user === 'f74e9cb3-2b53-4c85-9b0c-f1d61b032b3f'
  ) {
    return postgres.query(targetDomain, queryName, params, true)
  }

  if (
    requestingDomain === ADMIN_DOMAIN
    && targetDomain !== requestingDomain
    && (MODE === 'local' || user === await domainAdmin(targetDomain))
  ) {
    //  TODO: ensure read-only client
    return postgres.query(targetDomain, queryName, params, true)
  }

  const config = await configuration(targetDomain)
  let queryDefinition

  const queryDefinitions = config?.postgres?.queries

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
    const [q, p] = injectNamedParams(queryBody, targetDomain, requestingDomain, user, context, params)

    return postgres.query(targetDomain, q, p, true).catch(error => {
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

function injectNamedParams(queryBody, targetDomain, requestingDomain, user, context, params) {
  const namedParams = {
    DOMAIN: targetDomain,
    REQUESTING_DOMAIN: requestingDomain,
    CONTEXT: context
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
  return [queryBody, queryParams]
}