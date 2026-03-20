import { environment } from './utils.js'
import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'
import { schemaCache } from './stateful.js'

const {
  MODE,
  ADMIN_DOMAIN
} = environment

const CLIENT_CLEANUP_THRESHOLD = 30_000
const MAX_FOREIGN_QUERY_DEPTH = 25

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

export default async function configuredQuery(requestingDomain, targetDomain, queryName, params, user, context=[], queryStack=[]) {
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

  const queryKey = serializeForeignQueryReference(targetDomain, queryName)
  if (queryStack.includes(queryKey)) throw circularForeignQueryError(queryStack, queryKey)
  if (queryStack.length >= MAX_FOREIGN_QUERY_DEPTH) throw foreignQueryDepthExceededError(queryStack, queryKey)

  const nextQueryStack = [...queryStack, queryKey]
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
    const [q, p] = await prepareQuery(
      queryBody,
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      nextQueryStack
    )

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

async function prepareQuery(queryBody, requestingDomain, targetDomain, user, context, params, queryStack) {
  const namedParams = getNamedParams(targetDomain, requestingDomain, user, context)
  const [withForeignQueries, queryParams] = await injectForeignQueries(
    queryBody,
    requestingDomain,
    user,
    context,
    params,
    namedParams,
    queryStack
  )

  return injectNamedParams(withForeignQueries, queryParams, namedParams)
}

function getNamedParams(targetDomain, requestingDomain, user, context) {
  const namedParams = {
    DOMAIN: targetDomain,
    REQUESTING_DOMAIN: requestingDomain,
    CONTEXT: context
  }

  if (user) namedParams.REQUESTER = user

  return namedParams
}

async function injectForeignQueries(
  queryBody,
  requestingDomain,
  user,
  context,
  params,
  namedParams,
  queryStack
) {
  const queryParams = [...params]
  let nextForeignQuery = findForeignQuery(queryBody)

  while (nextForeignQuery) {
    const [foreignTargetDomain, foreignQueryName, ...foreignParams] = parseForeignQueryCall(
      nextForeignQuery.body,
      namedParams,
      params
    )

    const { rows } = await configuredQuery(
      requestingDomain,
      foreignTargetDomain,
      foreignQueryName,
      foreignParams,
      user,
      context,
      queryStack
    )

    queryParams.push(extractForeignQueryValues(rows, foreignTargetDomain, foreignQueryName))
    queryBody = (
      queryBody.slice(0, nextForeignQuery.start)
      + `$${queryParams.length}`
      + queryBody.slice(nextForeignQuery.end)
    )
    nextForeignQuery = findForeignQuery(queryBody)
  }

  return [queryBody, queryParams]
}

function parseForeignQueryCall(body, namedParams, params) {
  const args = splitForeignQueryArgs(body)

  if (args.length < 2) {
    const error = new Error('Foreign query calls require a domain and query name')
    error.code = 'INVALID FOREIGN QUERY'
    throw error
  }

  const [foreignTargetDomain, foreignQueryName, ...foreignArgExpressions] = args
  const targetDomain = resolveForeignQueryArgument(foreignTargetDomain, namedParams, params)
  const queryName = resolveForeignQueryArgument(foreignQueryName, namedParams, params)

  if (typeof targetDomain !== 'string' || typeof queryName !== 'string') {
    const error = new Error('Foreign query domain and query name must resolve to strings')
    error.code = 'INVALID FOREIGN QUERY'
    throw error
  }

  return [
    targetDomain,
    queryName,
    ...foreignArgExpressions.map(expression => resolveForeignQueryArgument(expression, namedParams, params))
  ]
}

function splitForeignQueryArgs(body) {
  const args = []
  let start = 0
  let parenDepth = 0
  let braceDepth = 0
  let bracketDepth = 0
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let index = 0; index < body.length; index++) {
    const char = body[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (inDoubleQuote) {
      if (char === '\\') escaped = true
      else if (char === '"') inDoubleQuote = false
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && body[index + 1] === "'") index += 1
      else if (char === "'") inSingleQuote = false
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '(') parenDepth += 1
    else if (char === ')') parenDepth -= 1
    else if (char === '{') braceDepth += 1
    else if (char === '}') braceDepth -= 1
    else if (char === '[') bracketDepth += 1
    else if (char === ']') bracketDepth -= 1
    else if (char === ',' && !parenDepth && !braceDepth && !bracketDepth) {
      args.push(body.slice(start, index).trim())
      start = index + 1
    }
  }

  const lastArg = body.slice(start).trim()
  if (lastArg.length) args.push(lastArg)

  return args
}

function resolveForeignQueryArgument(expression, namedParams, params) {
  const trimmed = expression.trim()

  if (!trimmed.length) {
    const error = new Error('Foreign query arguments cannot be empty')
    error.code = 'INVALID FOREIGN QUERY ARGUMENT'
    throw error
  }

  if (/^\$\d+$/.test(trimmed)) {
    const index = parseInt(trimmed.slice(1))
    if (index < 1 || index > params.length) {
      const error = new Error(`No positional parameter ${trimmed}`)
      error.code = 'INVALID FOREIGN QUERY ARGUMENT'
      throw error
    }

    return params[index - 1]
  }

  if (/^\$[A-Z_][A-Z0-9_]*$/.test(trimmed)) {
    const paramName = trimmed.slice(1)
    if (!(paramName in namedParams)) {
      const error = new Error(`No named parameter ${trimmed}`)
      error.code = 'INVALID FOREIGN QUERY ARGUMENT'
      throw error
    }

    return namedParams[paramName]
  }

  try {
    return JSON.parse(trimmed)
  }
  catch (_) {
    return trimmed
  }
}

function findForeignQuery(queryBody) {
  const start = queryBody.indexOf('$query(')

  if (start === -1) return null

  let depth = 1
  let inSingleQuote = false
  let inDoubleQuote = false
  let escaped = false

  for (let index = start + '$query('.length; index < queryBody.length; index++) {
    const char = queryBody[index]

    if (escaped) {
      escaped = false
      continue
    }

    if (inDoubleQuote) {
      if (char === '\\') escaped = true
      else if (char === '"') inDoubleQuote = false
      continue
    }

    if (inSingleQuote) {
      if (char === "'" && queryBody[index + 1] === "'") index += 1
      else if (char === "'") inSingleQuote = false
      continue
    }

    if (char === '"') {
      inDoubleQuote = true
      continue
    }

    if (char === "'") {
      inSingleQuote = true
      continue
    }

    if (char === '(') depth += 1
    else if (char === ')') {
      depth -= 1
      if (!depth) {
        return {
          start,
          end: index + 1,
          body: queryBody.slice(start + '$query('.length, index)
        }
      }
    }
  }

  const error = new Error('Foreign query call is missing a closing ")"')
  error.code = 'INVALID FOREIGN QUERY'
  throw error
}

function extractForeignQueryValues(rows, targetDomain, queryName) {
  return rows.map(row => {
    const columns = Object.keys(row)

    if (columns.length !== 1) {
      const error = new Error(`Foreign query "${queryName}" in ${targetDomain} must return exactly one column`)
      error.code = 'INVALID FOREIGN QUERY RESULT'
      throw error
    }

    return row[columns[0]]
  })
}

function serializeForeignQueryReference(targetDomain, queryName) {
  return JSON.stringify([targetDomain, queryName])
}

function circularForeignQueryError(queryStack, queryKey) {
  const error = new Error(`Circular foreign query reference: ${formatForeignQueryPath([...queryStack, queryKey])}`)
  error.code = 'CIRCULAR FOREIGN QUERY'
  return error
}

function foreignQueryDepthExceededError(queryStack, queryKey) {
  const error = new Error(`Foreign query depth exceeded ${MAX_FOREIGN_QUERY_DEPTH}: ${formatForeignQueryPath([...queryStack, queryKey])}`)
  error.code = 'FOREIGN QUERY DEPTH EXCEEDED'
  return error
}

function formatForeignQueryPath(queryStack) {
  return queryStack
    .map(queryReference => JSON.parse(queryReference).join('/'))
    .join(' -> ')
}

function injectNamedParams(queryBody, params, namedParams) {
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
