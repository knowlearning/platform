import { environment } from './utils.js'
import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'
import { pg } from './utils.js'

const {
  MODE,
  ADMIN_DOMAIN,
  POSTGRES_HOST,
  POSTGRES_PORT
} = environment

const CLIENT_CLEANUP_THRESHOLD = 30_000

const schemaCache = {}

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

  //  TODO: make sure requesting domain is accounted for in view generation/user id
  if (!queryBody && config?.postgres?.views) {
    //  TODO: check if queryName is a parseable query... if not abort
    //  TODO: include context when constructing view id and view
    const context_string = btoa(JSON.stringify(context))
    const schema = `schema_${config.id.replaceAll('-', '')}_${user.replaceAll('-', '')}_${context_string}`
    if (!schemaCache[schema]) {
      schemaCache[schema] = new Promise(async (resolve) => {
        const username = 'user_' + crypto.randomUUID().replace(/-/g, '').slice(0, 16)
        const password = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

        await postgres.query(targetDomain, `CREATE USER ${username} WITH PASSWORD '${password}'`)
        await postgres.query(targetDomain, `CREATE SCHEMA IF NOT EXISTS ${schema}`)
        await postgres.query(targetDomain, `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${username}`)
        await postgres.query(targetDomain, `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${username}`)
        await postgres.query(targetDomain, `ALTER ROLE ${username} SET search_path = ${schema}`)

        //  TODO: consider these limits
        await postgres.query(targetDomain, `ALTER ROLE ${username} SET work_mem = '512MB'`)
        await postgres.query(targetDomain, `ALTER ROLE ${username} SET statement_timeout = '2s'`)

        await Promise.all(Object.entries(config.postgres.views).map(async ([view, { query }]) => {
          //  TODO: supply context as an argument to the create or replace view function
          await postgres.query(targetDomain, `CREATE OR REPLACE VIEW ${schema}.${view} AS ${query}`)
          await postgres.query(targetDomain, `GRANT USAGE ON SCHEMA ${schema} TO ${username}`)
          await postgres.query(targetDomain, `GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${username}`)
        }))

        const client = new pg.Client({
          hostname: POSTGRES_HOST,
          port: POSTGRES_PORT,
          database: postgres.domainToDbName(targetDomain),
          user: username,
          password
        })

        await client.connect()

        resolve({ client, username, domain: targetDomain })
      })
    }

    const cacheResult = await schemaCache[schema]
    cacheResult.used = Date.now()
    const [q, p] = injectNamedParams(queryName, targetDomain, requestingDomain, user, context, params)
    return cacheResult.client.queryObject(q, p)
  }
  else if (queryBody) {
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