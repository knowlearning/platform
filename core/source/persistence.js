//  TODO: bring redis into here, but add getClientFor(id or domain) 

import * as redis from './redis.js'
import sync from './sync.js'
import { bigQueryBatchInserter } from './gcp-api.js'
import { environment } from './utils.js'

const { GC_PROJECT_ID, GCS_SERVICE_ACCOUNT_CREDENTIALS } = environment

const { insert: bqInsertPatch } = bigQueryBatchInserter({
  creds: JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS),
  project: GC_PROJECT_ID,
  dataset: 'core',
  table: 'patches'
})

export async function getState(id, options) {
  await redis.connected
  return redis.client.json.get(id, options)
}

export async function batchGetState(ids, options) {
  await redis.connected
  const transaction = redis.client.multi()
  ids.forEach(id => transaction.json.get(id, options))
  return await transaction.exec()
}

export async function setState(id, path, value, options) {
  await redis.connected
  return redis.client.json.set(id, path, value, options)
}

export async function stateExists(id) {
  await redis.connected
  return redis.client.exists(id)
}

export async function domainIds(domain) {
  await redis.connected
  return redis.client.sendCommand(['smembers', domain])
}

export async function subscribe(id, callback) {
  await redis.connected
  return redis.subscriptions.subscribe(id, callback)
}

export async function publish(id, message) {
  await redis.connected
  await (
    redis
      .client
      .publish(id, JSON.stringify(message))
      .catch(error => console.log('ERROR PUBLISHING!!!!!!!!', id, message))
  )
}

// BEGIN patchState implementation

const MAINTENANCE_SCRIPT = `
  local active_size = redis.call('JSON.DEBUG', 'MEMORY', KEYS[1])
  redis.call('JSON.SET', KEYS[1], '$.active_size', tonumber(active_size))
  redis.call('SADD', KEYS[2], KEYS[1])
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
  const transaction = redis.client.multi()
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

  transaction.eval(MAINTENANCE_SCRIPT, { keys: [id, domain] })
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
