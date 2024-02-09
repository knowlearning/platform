import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'
import sync from './sync.js'

const MAINTENANCE_SCRIPT = `
  local active_size = redis.call('JSON.DEBUG', 'MEMORY', KEYS[1])
  redis.call('JSON.SET', KEYS[1], '$["active_size"]', tonumber(active_size))
  redis.call('SADD', KEYS[2], KEYS[1])
`;

export default async function interact( domain, user, scope, patch, timestamp=Date.now() ) {
  //  TODO: validate that patch's paths can only start with "active", "active_type", or "name"
  console.log('INTERACTING TO HERE...', domain, user, scope, patch)
  const [scopeDomain, scopeOwner] = await Promise.all([
    redis.getJSON(scope, '$["domain"]'),
    redis.getJSON(scope, '$["owner"]')
  ])
  console.log('ABLE TO GET REDIS JSON STUFF????', domain, user, scope, patch, scopeDomain, scopeOwner)

  if (scopeDomain !== null && user !== null && (domain !== scopeDomain || user !== scopeOwner)) {
    console.log('DOMAIN OR USER MISMATCH FOR PATCH', scopeDomain, scopeOwner, domain, user, scope, patch)
    return {}
  }

  console.log('STILL INTERACTING....', domain, user, scope, patch)

  const transaction = await redis.transaction()
  const isInitializationPatch = patch[0].path.length === 1 && patch[0].path[0] === 'active_type'
  if (isInitializationPatch) {
    //  initialize scope (if DNE)
    const state = initializationState(domain, user)
    transaction.sendCommand('JSON.SET', [scope, '$', JSON.stringify(state), 'NX'])
  }
  transaction.sendCommand('JSON.SET',[scope, '$["active"]', '{}', 'NX']) // initialize state to empty object if does not exist
  transaction.sendCommand('JSON.NUMINCRBY', [scope, '$["ii"]', 1])

  for (let i=0; i<patch.length; i++) {
    const { op, path, value } = patch[i]
    const JSONPath = path.length ? `$[${path.map(JSON.stringify).join('][')}]` : '$'
    if (op === 'add') {
      if (JSONPath.match(/\[\-1\]$/)) { // if is to end of array then append
        transaction.sendCommand('JSON.ARRAPPEND', [scope, JSONPath.slice(0,-2), JSON.stringify(value)])
      }
      else if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.sendCommand('JSON.ARRINSERT', [scope, JSONPath.slice(0, -index.length-2), index, JSON.stringify(value)])
      }
      else transaction.sendCommand('JSON.SET', [scope, JSONPath, JSON.stringify(value)])
    }
    else if (op === 'remove') {
      if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.sendCommand('JSON.ARRPOP', [scope, JSONPath.slice(0, -index.length-2), index])
      }
      else transaction.sendCommand('JSON.DEL', [scope, JSONPath])
    }
    else if (op === 'replace') {
      // simple set should do for array and object
      transaction.sendCommand('JSON.SET', [scope, JSONPath, JSON.stringify(value)])
    }
  }

  transaction.sendCommand('EVAL', [MAINTENANCE_SCRIPT, 2, scope, domain])
  transaction.sendCommand('JSON.GET', [scope, '$["active_type"]'])

  try {
    const response = await transaction.flush()
    console.log(response)
    const ii = JSON.parse(response[isInitializationPatch ? 2 : 1])[0]
    //  TODO: cache active_types so as not to require fetch on each interaction
    const active_type = JSON.parse(response[response.length-1])[0]

    console.log('GOT ACTIVE TYPE!!!!!!!!!!!!!!!!!!!!!!!!!!!', response, active_type)

    redis
      .publish(scope, JSON.stringify({ domain, user, scope, patch, ii }))
      .catch(error => console.log('ERROR PUBLISHING!!!!!!!!', scope, error))

    await sync(domain, active_type, scope)

    console.log('SYNCED AFTER INTERACTION!!!!!!!!!', domain, scope, patch)

    return { ii, active_type }
  }
  catch (error) {
    console.log('ERROR EXECUTING TRANSACTION')
    console.log(error)
    console.log(domain, user, scope, timestamp, patch)
    return {}
  }
}