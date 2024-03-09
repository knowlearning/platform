import * as redis from '../redis.js'
import scopeToId from '../scope-to-id.js'
import sync from './sync.js'

const MAINTENANCE_SCRIPT = `
  local active_size = redis.call('JSON.DEBUG', 'MEMORY', KEYS[1])
  redis.call('JSON.SET', KEYS[1], '$.active_size', tonumber(active_size))
  redis.call('SADD', KEYS[2], KEYS[1])
`;

export default async function interact( domain, user, scope, patch, timestamp=Date.now() ) {
  //  TODO: validate that patch's paths can only start with "active", "active_type", or "name"
  await redis.connected
  const id = domain === 'core' && user === 'core' ? scope : await scopeToId(domain, user, scope)
  const info = await redis.client.json.get(id, { path: ['$.domain', '$.owner' ]})

  if (info !== null && (domain !== info?.['$.domain'][0] || user !== info?.['$.owner'][0])) {
    console.log('DOMAIN OR USER MISMATCH FOR PATCH', info, domain, user, scope, patch)
    throw new Error('DOMAIN OR USER MISMATCH FOR PATCH')
  }

  const transaction = redis.client.multi()
  transaction.json.set(id, '$.active', {}, { NX: true }) // initialize state to empty object if does not exist
  transaction.json.numIncrBy(id, '$.ii', 1)

  for (let i=0; i<patch.length; i++) {
    const { op, path, value } = patch[i]
    const JSONPath = path.length ? `$[${path.map(JSON.stringify).join('][')}]` : '$'
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
  }

  transaction.eval(MAINTENANCE_SCRIPT, { keys: [id, domain] })
  transaction.json.get(id, { path: '$.active_type' })

  try {
    const response = await transaction.exec()
    const ii = response[1][0]
    //  TODO: cache active_types so as not to require fetch on each interaction
    const active_type = response[response.length-1][0]

    redis
      .client
      .publish(id, JSON.stringify({ domain, user, scope: id, patch, ii })) //  TODO: fix this odd scope/id situation...
      .catch(error => console.log('ERROR PUBLISHING!!!!!!!!', domain, user, scope, id, error))

    await sync(domain, user, active_type, scope)

    return { ii, active_type }
  }
  catch (error) {
    console.log('ERROR EXECUTING TRANSACTION')
    console.log(error)
    console.log(domain, user, scope, timestamp, patch)
    return {}
  }
}