// Persistence Backend

import { bigQueryBatchInserter } from '../gcp-api.js'
import { getState, publish } from '../persistence.js'
import * as redis from '../redis.js'
import scopeToId from '../scope-to-id.js'
import sync from './sync.js'
import { environment } from '../utils.js'

const {
  GC_PROJECT_ID,
  GCS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

const { insert: bqInsertPatch } = bigQueryBatchInserter({
  creds: JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS),
  project: GC_PROJECT_ID,
  dataset: 'core',
  table: 'patches'
})

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

const replacements = [
  [/\\"/g, '"'],
  [/\\'/g, "\\'"]
]

function applyReplacements(ref) {
  return replacements.reduce((s, [from, to]) => s.replace(from, to), ref)
}

function encodePathReference(ref) {
  return /^[0-9]+$/.test(ref) ? ref : `'${applyReplacements(ref)}'`
}

function standardJSONPath(arrayPath) {
  return arrayPath.length ? `$[${arrayPath.map(encodePathReference).join('][')}]` : '$'
}

export default async function interact( domain, user, scope, patch, context=[], timestamp=Date.now() ) {
  //  TODO: validate that patch's paths can only start with "active", "active_type", or "name"

  const id = domain === 'core' && user === 'core' ? scope : await scopeToId(domain, user, scope)
  const info = await getState(id, { path: ['$.domain', '$.owner' ]})

  if (info !== null && (domain !== info?.['$.domain'][0] || user !== info?.['$.owner'][0])) {
    console.log('DOMAIN OR USER MISMATCH FOR PATCH', info, domain, user, scope, patch)
    throw new Error('DOMAIN OR USER MISMATCH FOR PATCH')
  }

  const transaction = redis.client.multi()
  transaction.json.set(id, '$.active', {}, { NX: true }) // initialize state to empty object if does not exist
  transaction.json.numIncrBy(id, '$.ii', 1)

  for (let i=0; i<patch.length; i++) {
    const { op, path, from, value } = patch[i]
    const lastPathSegment = path[path.length-1]
    const JSONPath = standardJSONPath(path)
    if (op === 'add') {
      if (lastPathSegment === -1) { // if is to end of array then append
        transaction.json.arrAppend(id, standardJSONPath(path.slice(0, -1)), value)
      }
      else if (Number.isInteger(lastPathSegment)) {
        transaction.json.arrInsert(id, standardJSONPath(path.slice(0, -1)), lastPathSegment, value)
      }
      else transaction.json.set(id, standardJSONPath(path), value)
    }
    else if (op === 'remove') {
      if (Number.isInteger(lastPathSegment)) {
        transaction.json.arrPop(id, standardJSONPath(path.slice(0, -1)), lastPathSegment)
      }
      else transaction.json.del(id, standardJSONPath(path))
    }
    else if (op === 'replace') {
      transaction.json.set(id, standardJSONPath(path), value)
    }
    else if (op === 'move') {
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
  }

  transaction.eval(MAINTENANCE_SCRIPT, { keys: [id, domain] })
  transaction.json.set(id, '$.updated', timestamp)
  transaction.json.get(id, { path: '$.active_type' })

  try {
    const response = await transaction.exec()
    const ii = response[1][0]
    //  TODO: cache active_types so as not to require fetch on each interaction
    const active_type = response[response.length-1][0]

    publish(id, { domain, user, scope: id, patch, ii }) //  TODO: fix this odd scope -> id situation...

    await sync(domain, user, active_type, scope)

    patch
      .map(({ op, path, from=null, value=null }) => {
        bqInsertPatch({
          timestamp: new Date(timestamp).toISOString(),
          id,
          index: ii,
          op,
          path: JSON.stringify(path),
          from: JSON.stringify(from),
          value: JSON.stringify(value),
          domain,
          user,
          name: scope,
          context: JSON.stringify(context)
        })
      })

    return { ii, active_type }
  }
  catch (error) {
    console.log('ERROR EXECUTING TRANSACTION')
    console.log(error)
    console.log(domain, user, scope, timestamp, patch)
    return {}
  }
}