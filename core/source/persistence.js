import * as redis from './redis.js'
import sync from './sync.js'
import { bigQueryBatchInserter } from './gcp-api.js'
import { environment, isUUID } from './utils.js'

const { GC_PROJECT_ID, GCS_SERVICE_ACCOUNT_CREDENTIALS } = environment

const { insert: bqInsertPatch } = bigQueryBatchInserter({
  creds: JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS),
  project: GC_PROJECT_ID,
  dataset: 'core',
  table: 'patches'
})

const UUID_OWNER_HASH_KEY = '__knowlearning:uuid-owner-domain'
const DOMAIN_UUID_SET_PREFIX = '__knowlearning:domain-uuids:'
const uuidOwnerCache = new Map()

const CLAIM_UUID_OWNER_SCRIPT = `
  local current_owner = redis.call('HGET', KEYS[1], ARGV[1])

  if current_owner then
    if current_owner == ARGV[2] then
      redis.call('SADD', KEYS[2], ARGV[1])
    end
    return { current_owner, 0 }
  end

  redis.call('HSET', KEYS[1], ARGV[1], ARGV[2])
  redis.call('SADD', KEYS[2], ARGV[1])
  return { ARGV[2], 1 }
`

function domainUUIDSetKey(domain) {
  return `${DOMAIN_UUID_SET_PREFIX}${domain}`
}

function normalizeDomainPathResponse(response) {
  if (!response) return null
  if (Array.isArray(response)) return response[0] || null
  if (Array.isArray(response['$.domain'])) return response['$.domain'][0] || null
  if (typeof response === 'string') return response
  return null
}

async function indexedOwnerDomain(id) {
  if (!isUUID(id)) return null
  if (uuidOwnerCache.has(id)) return uuidOwnerCache.get(id)

  await redis.connected
  const domain = await redis.client.hGet(UUID_OWNER_HASH_KEY, id)

  if (domain) uuidOwnerCache.set(id, domain)
  return domain || null
}

async function claimUUIDOwner(domain, id) {
  await redis.connected

  const [ownerDomain, claimed] = await redis.client.eval(
    CLAIM_UUID_OWNER_SCRIPT,
    {
      keys: [UUID_OWNER_HASH_KEY, domainUUIDSetKey(domain)],
      arguments: [id, domain]
    }
  )

  if (ownerDomain) uuidOwnerCache.set(id, ownerDomain)
  return { ownerDomain, claimed: claimed === 1 || claimed === '1' }
}

async function stateDomainOnClient(client, id) {
  try {
    return normalizeDomainPathResponse(
      await client.json.get(id, { path: ['$.domain'] })
    )
  }
  catch (error) {
    console.warn('ERROR CHECKING UUID OWNER FALLBACK', id, error)
    return null
  }
}

async function findExistingOwnerDomain(id) {
  const found = []

  await Promise.all(
    redis
      .commandClients()
      .map(async ({ serverName, client }) => {
        const domain = await stateDomainOnClient(client, id)
        if (domain) found.push({ serverName, domain })
      })
  )

  if (found.length > 1 && new Set(found.map(({ domain }) => domain)).size > 1) {
    throw new Error(`UUID ${id} exists on multiple Redis servers: ${JSON.stringify(found)}`)
  }

  return found[0]?.domain || null
}

async function ownerDomainForState(domain, id, { create=false }={}) {
  if (!isUUID(id)) return domain

  const indexedDomain = await indexedOwnerDomain(id)
  if (indexedDomain) return indexedDomain

  const existingDomain = await findExistingOwnerDomain(id)
  if (existingDomain) {
    const { ownerDomain } = await claimUUIDOwner(existingDomain, id)
    if (ownerDomain !== existingDomain) {
      throw new Error(`UUID ${id} exists in ${existingDomain} but owner index says ${ownerDomain}`)
    }
    return ownerDomain
  }

  if (!create) return null

  return (await claimUUIDOwner(domain, id)).ownerDomain
}

async function clientForState(domain, id, options) {
  const ownerDomain = await ownerDomainForState(domain, id, options)
  return redis.clientForDomain(ownerDomain || domain)
}

export async function claimStateOwner(domain, id) {
  return ownerDomainForState(domain, id, { create: true })
}

export async function getState(domain, id, options) {
  await redis.connected
  return (await clientForState(domain, id)).json.get(id, options)
}

export async function batchGetState(domain, ids, options) {
  await redis.connected
  const results = new Array(ids.length)
  const groups = new Map()

  await Promise.all(
    ids.map(async (id, index) => {
      const client = await clientForState(domain, id)
      if (!groups.has(client)) groups.set(client, [])
      groups.get(client).push({ id, index })
    })
  )

  await Promise.all(
    [...groups.entries()].map(async ([client, entries]) => {
      const transaction = client.multi()
      entries.forEach(({ id }) => transaction.json.get(id, options))
      const response = await transaction.exec()
      response.forEach((value, index) => {
        results[entries[index].index] = value
      })
    })
  )

  return results
}

export async function setState(domain, id, path, value, options) {
  await redis.connected
  const ownerDomain = await ownerDomainForState(domain, id, { create: isUUID(id) })

  if (isUUID(id) && path === '$' && value?.domain && value.domain !== ownerDomain) {
    throw new Error(`UUID ${id} is owned by ${ownerDomain}; refusing to initialize for ${value.domain}`)
  }

  return redis.clientForDomain(ownerDomain || domain).json.set(id, path, value, options)
}

export async function stateExists(domain, id) {
  await redis.connected
  const ownerDomain = await ownerDomainForState(domain, id)
  if (isUUID(id) && !ownerDomain) return false
  return redis.clientForDomain(ownerDomain || domain).exists(id)
}

export async function domainIds(domain) {
  await redis.connected
  const indexedIds = await redis.client.sendCommand(['smembers', domainUUIDSetKey(domain)])
  const legacyIds = await legacyDomainIds(domain)
  const ids = new Set(indexedIds)

  await Promise.all(
    legacyIds.map(async id => {
      const ownerDomain = await ownerDomainForState(domain, id)
      if (ownerDomain === domain) ids.add(id)
    })
  )

  return [...ids]
}

export async function copyDomainStateToRedisServer(domain, fromServerName, toServerName, report) {
  if (fromServerName === toServerName) return { copied: 0, skipped: true }

  await redis.connected

  const task = report?.tasks
  if (task) {
    if (!task.redis) task.redis = {}
    task.redis.move = [
      `Copying ${domain} from ${fromServerName} to ${toServerName}`
    ]
  }

  const fromClient = redis.clientForServer(fromServerName)
  const toClient = redis.clientForServer(toServerName)
  const indexedIds = await redis.client.sendCommand(['smembers', domainUUIDSetKey(domain)])
  let legacyIds = []

  try {
    legacyIds = await fromClient.sendCommand(['smembers', domain])
  }
  catch (_) {}

  const ids = [...new Set([...indexedIds, ...legacyIds].filter(isUUID))]
  const progressInterval = 1000
  let copied = 0

  for (const id of ids) {
    const state = await fromClient.json.get(id)
    if (!state || state.domain !== domain) continue

    await claimUUIDOwner(domain, id)
    await redis.client.sendCommand(['SADD', domainUUIDSetKey(domain), id])
    await toClient.json.set(id, '$', state)
    copied += 1
    if (task?.redis?.move && copied % progressInterval === 0) {
      task.redis.move.push(`Copied ${copied}/${ids.length} states`)
    }
  }

  if (task?.redis?.move && (copied === 0 || copied % progressInterval !== 0)) {
    task.redis.move.push(`Copied ${copied}/${ids.length} states`)
  }

  return { copied, skipped: false }
}

export async function subscribe(id, callback) {
  await redis.connected
  return redis.subscriptions.subscribe(id, callback)
}

export async function publish(id, message) {
  await redis.connected
  await redis.publishAll(id, JSON.stringify(message))
}

async function legacyDomainIds(domain) {
  const ids = []

  await Promise.all(
    redis
      .commandClients()
      .map(async ({ client }) => {
        try {
          ids.push(...await client.sendCommand(['smembers', domain]))
        }
        catch (_) {}
      })
  )

  return [...new Set(ids.filter(isUUID))]
}

// BEGIN patchState implementation

const MAINTENANCE_SCRIPT = `
  local active_size = redis.call('JSON.DEBUG', 'MEMORY', KEYS[1])
  redis.call('JSON.SET', KEYS[1], '$.active_size', tonumber(active_size))
`

const MOVE_SCRIPT = `
  local key = KEYS[1]
  local path = ARGV[1]
  local from_index = tonumber(ARGV[2])
  local to_index = tonumber(ARGV[3])

  redis.log(redis.LOG_DEBUG, "Key: " .. key .. " from: " .. from_index .. " to: " .. to_index .. ", Path:" .. path)

  local moveValue = redis.call('JSON.ARRPOP', key, path, from_index)[1]
  local castedMoveValue = cjson.decode(cjson.encode(moveValue))
  redis.call('JSON.ARRINSERT', key, path, to_index, castedMoveValue)
`

const replacements = [[/\\"/g, '"'], [/\\'/g, "\\'"]]

function applyReplacements(ref) {
  return replacements.reduce((s, [from, to]) => s.replace(from, to), ref)
}

function encodePathReference(ref) {
  return /^[0-9]+$/.test(ref) ? ref : `'${applyReplacements(ref)}'`
}

function standardJSONPath(arrayPath) {
  return arrayPath.length ? `$[${arrayPath.map(encodePathReference).join('][')}]` : '$'
}

export async function patchState(domain, user, context, id, patch, timestamp, name) {
  const client = await clientForState(domain, id, { create: isUUID(id) })
  const transaction = client.multi()
  transaction.json.set(id, '$.active', {}, { NX: true }) // initialize state to empty object if does not exist
  transaction.json.numIncrBy(id, '$.ii', 1)

  for (let i=0; i<patch.length; i++) {
    const { op, path, from, value } = patch[i]
    const lastPathSegment = path[path.length-1]

    if (op === 'add') add(transaction, id, path, value)
    else if (op === 'remove') remove(transaction, id, path)
    else if (op === 'replace') replace(transaction, id, path, value)
    else if (op === 'move') move(transaction, id, path, from)
  }

  transaction.eval(MAINTENANCE_SCRIPT, { keys: [id] })
  transaction.json.set(id, '$.updated', timestamp)
  transaction.json.get(id, { path: '$.active_type' })

  const response = await transaction.exec()

  const ii = response[1][0]
  const type = response[response.length-1][0]

  publish(id, { domain, user, scope: id, patch, ii }) //  TODO: fix this odd scope -> id situation...

  await sync(domain, user, type, name)

  recordPatch(domain, user, context, id, ii, name, patch, timestamp)

  //  TODO: cache active_types so as not to require fetch on each interaction
  return { ii, type }
}

function add(transaction, id, path, value) {
  const lastPathSegment = path[path.length-1]
  if (lastPathSegment === -1) { // if is to end of array then append
    transaction.json.arrAppend(id, standardJSONPath(path.slice(0, -1)), value)
  }
  else if (Number.isInteger(lastPathSegment)) {
    transaction.json.arrInsert(id, standardJSONPath(path.slice(0, -1)), lastPathSegment, value)
  }
  else transaction.json.set(id, standardJSONPath(path), value)
}

function remove(transaction, id, path) {
  const lastPathSegment = path[path.length-1]
  if (Number.isInteger(lastPathSegment)) {
    transaction.json.arrPop(id, standardJSONPath(path.slice(0, -1)), lastPathSegment)
  }
  else transaction.json.del(id, standardJSONPath(path))
}

function replace(transaction, id, path, value) {
  transaction.json.set(id, standardJSONPath(path), value)
}

function move(transaction, id, path, from) {
  //  right now the only working moves are those that come out
  //  of the @knowlearning/patch-proxy npm package (only for moves
  //  within the same array)

  //  TODO: remove above limitation
  const fromIndex = from[from.length - 1]
  const toIndex = path[path.length - 1]
  const arrayPath = standardJSONPath(path.slice(0, -1))
  const params = { keys: [id], arguments: [arrayPath, ''+fromIndex, ''+toIndex] }
  transaction.eval(MOVE_SCRIPT, params)
}

function recordPatch(domain, user, context, id, index, name, patch, timestamp) {
  patch
    .map(({ op, path, from=null, value=null }) => {
      bqInsertPatch({
        timestamp: new Date(timestamp).toISOString(),
        id,
        index,
        op,
        path: JSON.stringify(path),
        from: JSON.stringify(from),
        value: JSON.stringify(value),
        domain,
        user,
        name,
        context: JSON.stringify(context)
      })
    })
}
