import { environment } from './utils.js'
import * as postgres from './postgres.js'
import configuration, { domainAdmin } from './configuration.js'
import { domainListAllowsDomain } from './domain-patterns.js'

const {
  MODE,
  ADMIN_DOMAIN
} = environment

const MAX_FOREIGN_QUERY_DEPTH = 25

export default async function configuredQuery(requestingDomain, targetDomain, queryName, params=[], user, context=[], queryStack=[]) {
  if (typeof targetDomain !== 'string') {
    const error = new Error(`Query target domain must be a string: ${JSON.stringify(targetDomain)}`)
    error.code = 'INVALID QUERY TARGET DOMAIN'
    throw error
  }

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
  else if (domainListAllowsDomain(queryDefinitions?.[queryName]?.domains, requestingDomain)) {
    queryDefinition = queryDefinitions[queryName]
  }

  const queryBody = typeof queryDefinition === 'string'
    ? queryDefinition
    : queryDefinition?.body

  if (queryBody) {
    const [q, p] = await prepareQuery(
      queryDefinition,
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

async function prepareQuery(queryDefinition, requestingDomain, targetDomain, user, context, params=[], queryStack) {
  const config = await configuration(targetDomain)
  const queryBody = typeof queryDefinition === 'string'
    ? queryDefinition
    : queryDefinition?.body
  const namedParams = getNamedParams(targetDomain, requestingDomain, user, context)
  const variables = config?.variables || {}
  const externalValues = await resolveExternalBindings(
    queryDefinition?.external,
    requestingDomain,
    targetDomain,
    user,
    context,
    params,
    namedParams,
    variables,
    queryStack
  )

  return injectQueryReferences(
    queryBody,
    requestingDomain,
    targetDomain,
    user,
    context,
    params,
    namedParams,
    externalValues,
    queryStack
  )
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

async function resolveExternalBindings(
  externalDefinitions={},
  requestingDomain,
  targetDomain,
  user,
  context,
  params,
  namedParams,
  variables,
  queryStack
) {
  const resolvedExternalValues = {}
  for (const name of Object.keys(externalDefinitions)) {
    await resolveExternalBinding(
      name,
      externalDefinitions,
      resolvedExternalValues,
      [],
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      namedParams,
      variables,
      queryStack
    )
  }

  return resolvedExternalValues
}

async function resolveExternalBinding(
  name,
  externalDefinitions,
  resolvedExternalValues,
  resolvingExternalNames,
  requestingDomain,
  targetDomain,
  user,
  context,
  params,
  namedParams,
  variables,
  queryStack
) {
  if (name in resolvedExternalValues) return resolvedExternalValues[name]
  if (!(name in externalDefinitions)) {
    const error = new Error(`No external query named "${name}"`)
    error.code = 'INVALID EXTERNAL QUERY'
    throw error
  }
  if (resolvingExternalNames.includes(name)) {
    const error = new Error(`Circular external query reference: ${[...resolvingExternalNames, name].join(' -> ')}`)
    error.code = 'CIRCULAR EXTERNAL QUERY'
    throw error
  }

  resolvingExternalNames.push(name)
  try {
    const definition = externalDefinitions[name]
    const externalTargetDomain = await resolveExternalValue(
      definition?.domain,
      externalDefinitions,
      resolvedExternalValues,
      resolvingExternalNames,
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      namedParams,
      variables,
      queryStack
    )
    const externalQueryName = await resolveExternalValue(
      definition?.query,
      externalDefinitions,
      resolvedExternalValues,
      resolvingExternalNames,
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      namedParams,
      variables,
      queryStack
    )
    const externalParams = await resolveExternalParams(
      definition?.params || [],
      externalDefinitions,
      resolvedExternalValues,
      resolvingExternalNames,
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      namedParams,
      variables,
      queryStack
    )

    if (typeof externalTargetDomain !== 'string' || typeof externalQueryName !== 'string') {
      const error = new Error(`External query "${name}" must resolve string "domain" and "query" values`)
      error.code = 'INVALID EXTERNAL QUERY'
      throw error
    }

    const { rows } = await configuredQuery(
      requestingDomain,
      externalTargetDomain,
      externalQueryName,
      externalParams,
      user,
      context,
      queryStack
    )

    const resolvedValue = extractForeignQueryValues(rows, externalTargetDomain, externalQueryName)
    resolvedExternalValues[name] = resolvedValue
    return resolvedValue
  }
  finally {
    resolvingExternalNames.pop()
  }
}

async function resolveExternalParams(
  values,
  externalDefinitions,
  resolvedExternalValues,
  resolvingExternalNames,
  requestingDomain,
  targetDomain,
  user,
  context,
  params,
  namedParams,
  variables,
  queryStack
) {
  return Promise.all(values.map(value => resolveExternalValue(
    value,
    externalDefinitions,
    resolvedExternalValues,
    resolvingExternalNames,
    requestingDomain,
    targetDomain,
    user,
    context,
    params,
    namedParams,
    variables,
    queryStack
  )))
}

async function resolveExternalValue(
  value,
  externalDefinitions,
  resolvedExternalValues,
  resolvingExternalNames,
  requestingDomain,
  targetDomain,
  user,
  context,
  params,
  namedParams,
  variables,
  queryStack
) {
  const referenceName = getReferenceName(value)
  if (!referenceName) return value

  if (/^\d+$/.test(referenceName)) {
    const index = parseInt(referenceName)
    if (index < 1 || index > params.length) {
      const error = new Error(`No positional parameter $${referenceName}`)
      error.code = 'INVALID EXTERNAL QUERY ARGUMENT'
      throw error
    }

    return params[index - 1]
  }

  if (referenceName in namedParams) return namedParams[referenceName]
  if (referenceName in externalDefinitions) {
    return resolveExternalBinding(
      referenceName,
      externalDefinitions,
      resolvedExternalValues,
      resolvingExternalNames,
      requestingDomain,
      targetDomain,
      user,
      context,
      params,
      namedParams,
      variables,
      queryStack
    )
  }
  if (referenceName in variables) return variables[referenceName]

  const error = new Error(`No external binding ${value}`)
  error.code = 'INVALID EXTERNAL QUERY ARGUMENT'
  throw error
}

async function injectQueryReferences(
  queryBody,
  requestingDomain,
  targetDomain,
  user,
  context,
  params,
  namedParams,
  externalValues,
  queryStack
) {
  const queryParams = []
  const tokens = collectParameterTokens(queryBody)
  const tokenParams = {}

  for (const token of tokens) {
    const tokenKey = token.value
    if (tokenKey in tokenParams) continue

    if (token.type === 'positional') {
      const index = parseInt(token.value)
      if (index < 1 || index > params.length) {
        const error = new Error(`No positional parameter $${token.value}`)
        error.code = 'INVALID QUERY REFERENCE'
        throw error
      }

      queryParams.push(params[index - 1])
    }
    else if (token.value in externalValues) {
      queryParams.push(externalValues[token.value])
    }
    else if (token.value in namedParams) {
      queryParams.push(namedParams[token.value])
    }
    else if (/^[A-Z_][A-Z0-9_]*$/.test(token.value)) {
      const error = new Error(`No named parameter $${token.value}`)
      error.code = 'INVALID QUERY REFERENCE'
      throw error
    }
    else {
      const { rows } = await configuredQuery(
        requestingDomain,
        targetDomain,
        token.value,
        params,
        user,
        context,
        queryStack
      )
      queryParams.push(extractForeignQueryValues(rows, targetDomain, token.value))
    }

    tokenParams[tokenKey] = queryParams.length
  }

  return [replaceQueryReferenceTokens(queryBody, tokens, tokenParams), queryParams]
}

function getReferenceName(value) {
  if (typeof value !== 'string') return null
  const match = value.match(/^\$([A-Za-z_][A-Za-z0-9_-]*|\d+)$/)
  return match?.[1] || null
}

function collectParameterTokens(queryBody) {
  const tokens = []
  let inSingleQuote = false
  let inDoubleQuote = false
  let inDollarQuote = null
  let inLineComment = false
  let inBlockComment = false
  let escaped = false

  for (let index = 0; index < queryBody.length; index++) {
    const char = queryBody[index]

    if (inLineComment) {
      if (char === '\n') inLineComment = false
      continue
    }

    if (inBlockComment) {
      if (char === '*' && queryBody[index + 1] === '/') {
        inBlockComment = false
        index += 1
      }
      continue
    }

    if (inDollarQuote) {
      if (queryBody.startsWith(inDollarQuote, index)) {
        index += inDollarQuote.length - 1
        inDollarQuote = null
      }
      continue
    }

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

    if (char === '-' && queryBody[index + 1] === '-') {
      inLineComment = true
      index += 1
      continue
    }

    if (char === '/' && queryBody[index + 1] === '*') {
      inBlockComment = true
      index += 1
      continue
    }

    if (char === '$') {
      const dollarQuote = queryBody
        .slice(index)
        .match(/^\$(?:[A-Za-z_][A-Za-z0-9_]*)?\$/)?.[0]
      if (dollarQuote) {
        inDollarQuote = dollarQuote
        index += dollarQuote.length - 1
        continue
      }
    }

    if (char !== '$') continue
    if (!/[\dA-Za-z_]/.test(queryBody[index + 1])) continue

    const type = /\d/.test(queryBody[index + 1]) ? 'positional' : 'reference'
    let end = index + 2
    const pattern = type === 'positional' ? /\d/ : /[A-Za-z0-9_-]/
    while (pattern.test(queryBody[end])) end += 1

    tokens.push({
      start: index,
      end,
      type,
      value: queryBody.slice(index + 1, end)
    })
    index = end - 1
  }

  return tokens
}

function replaceQueryReferenceTokens(queryBody, tokens, tokenParams) {
  let nextStart = 0
  let nextBody = ''

  tokens.forEach(({ start, end, value }) => {
    nextBody += queryBody.slice(nextStart, start)
    nextBody += `$${tokenParams[value]}`
    nextStart = end
  })

  return nextBody + queryBody.slice(nextStart)
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
