import { environment } from './utils.js'
import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'

const { MODE, ADMIN_DOMAIN } = environment

const schemaCache = {}

export default async function (requestingDomain, targetDomain, queryName, params, user) {
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
    const schema = `${config.id.replaceAll('-', '')}_${user.replaceAll('-', '')}`
    if (!schemaCache[schema]) {
      //  TODOS:
      /*
            create view for each of the entries in config.postgres.views
            give user read access to the view
      */
      const username = crypto.randomUUID().replace(/-/g, '').slice(0, 16)
      const password = crypto.randomUUID().replace(/-/g, '').slice(0, 16)

      await postgres.query(targetDomain, `CREATE USER ${username} WITH PASSWORD '${password}';`)
      await postgres.query(targetDomain, `CREATE SCHEMA IF NOT EXISTS ${schema};`)
      await postgres.query(targetDomain, `REVOKE ALL PRIVILEGES ON SCHEMA public FROM ${username};`)
      await postgres.query(targetDomain, `REVOKE ALL PRIVILEGES ON ALL TABLES IN SCHEMA public FROM ${username};`)

      await Promise.all(Object.entries(config.postgres.views).map(async ([name, { query }]) => {
        await postgres.query(targetDomain, `CREATE OR REPLACE VIEW ${schema}.${view} AS ${query}`)
        await postgres.query(targetDomain, `GRANT USAGE ON SCHEMA ${schema} TO ${username};`)
        await postgres.query(targetDomain, `GRANT SELECT ON ALL TABLES IN SCHEMA ${schema} TO ${username};`)
      }))

      schemaCache[schema] = {
        username,
        password
      }
    }

    //  TODO: execute query as configUserViewId profile
  }

  if (queryBody) {
    const namedParams = {
      DOMAIN: targetDomain,
      REQUESTING_DOMAIN: requestingDomain
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

    return postgres.query(targetDomain, queryBody, queryParams, true).catch(error => {
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
