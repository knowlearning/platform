import { decodeJSON } from './externals.js'
import { client as redis } from './redis.js'

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

function arrayPathRepresentationToJSONPath(arrayPath, metadata) {
const prefix = metadata ? `$['metadata']` :`$['state']`
  return arrayPath.length ? `${prefix}[${arrayPath.map(JSON.stringify).join('][')}]` : prefix
}

export default async function handleCacheUpdate(id, message, seq) {
  //  TODO: decide what to do on cache miss

  const transaction = redis.multi()
  transaction.json.set(id, '$', { state: {}, metadata: {}, sequence: 0 }, { NX: true }) // initialize state to empty object if does not exist
  const patch = decodeJSON(message.data)

  for (let i=0; i<patch.length; i++) {
    const { op, path, from, value, metadata } = patch[i]
    const JSONPath = arrayPathRepresentationToJSONPath(path, metadata)
    if (op === 'add') {
      if (JSONPath.match(/\[\-1\]$/)) { // if is to end of array then append
        transaction.json.arrAppend(id, JSONPath.slice(0,-2), value)
      }
      else if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.json.arrInsert(id, JSONPath.slice(0, -index.length-2), index, value)
      }
      else transaction.json.set(id, JSONPath, value)
    }
    else if (op === 'remove') {
      if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.json.arrPop(id, JSONPath.slice(0, -index.length-2), index)
      }
      else transaction.json.del(id, JSONPath)
    }
    else if (op === 'replace') {
      // simple set should do for array and object
      transaction.json.set(id, JSONPath, value)
    }
    else if (op === 'move') {
      //  right now the only working moves are those that come out
      //  of the @knowlearning/patch-proxy npm package (only for moves
      //  within the same array)

      //  TODO: remove above limitation
      const fromIndex = from[from.length - 1]
      const toIndex = path[path.length - 1]
      const arrayPath = arrayPathRepresentationToJSONPath(path.slice(0, -1), metadata)
      const params = { keys: [id], arguments: [arrayPath, ''+fromIndex, ''+toIndex] }
      transaction.eval(MOVE_SCRIPT, params)
    }
  }

  transaction.json.set(id, `$['sequence']`, seq) //  TODO: this is an opportunity to ensure sequence is applied in order

  await transaction.exec()
}

export function getCache(id) {
  return redis.json.get(id)
}
