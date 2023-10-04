import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'
import sync from './sync.js'

export default async function interact( domain, user, scope, patch, timestamp=Date.now() ) {
  //  TODO: validate that patch's paths can only start with "active", "active_type", or "name"
  await redis.connected

  const transaction = redis.client.multi()
  const isInitializationPatch = patch[0].path.length === 1 && patch[0].path[0] === 'active_type'
  if (isInitializationPatch) {
    //  initialize scope (if DNE)
    const state = initializationState(domain, user)
    transaction.json.set(scope, '$', state, { NX: true })
  }
  transaction.json.set(scope, '$.active', {}, { NX: true }) // initialize state to empty object if does not exist
  //  TODO: hook this back in when we have a compaction strategy in place
  //  transaction.json.arrAppend(scope, '$["history"]', { session, patch, timestamp })

  transaction.json.numIncrBy(scope, '$.ii', 1)

  for (let i=0; i<patch.length; i++) {
    const { op, path, value } = patch[i]
    const JSONPath = path.length ? `$[${path.map(JSON.stringify).join('][')}]` : '$'
    if (op === 'add') {
      if (JSONPath.match(/\[\-1\]$/)) { // if is to end of array then append
        transaction.json.arrAppend(scope, JSONPath.slice(0,-2), value)
      }
      else if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.json.arrInsert(scope, JSONPath.slice(0, -index.length-2), index, value)
      }
      else transaction.json.set(scope, JSONPath, value)
    }
    else if (op === 'remove') {
      if (JSONPath.match(/\[\d+\]$/)) {
        const index = JSONPath.match(/\[(\d+)\]$/)[1]
        transaction.json.arrPop(scope, JSONPath.slice(0, -index.length-2), index)
      }
      else transaction.json.del(scope, JSONPath)
    }
    else if (op === 'replace') {
      // simple set should do for array and object
      transaction.json.set(scope, JSONPath, value)
    }
  }
  transaction.json.get(scope, { path: '$.active_type' })

  try {
    const response = await transaction.exec()
    const ii = response[isInitializationPatch ? 2 : 1][0]
    //  TODO: cache active_types so as not to require fetch on each interaction
    const active_type = response[response.length-1][0]

    redis
      .client
      .publish(scope, JSON.stringify({ domain, user, scope, patch, ii }))
      .catch(error => console.log('ERROR PUBLISHING!!!!!!!!', scope, error))

    await sync(domain, active_type, scope)

    return { ii, active_type }
  }
  catch (error) {
    console.log('ERROR EXECUTING TRANSACTION')
    console.log(error)
    console.log(domain, user, scope, timestamp, patch)
    return {}
  }
}