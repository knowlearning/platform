import scopeToId from './scope-to-id.js'
import configuredQuery from './configured-query.js'
import sideEffects from './side-effects/index.js'
import subscriptions from './subscriptions.js'
import subscribe from './subscribe.js'
import authorize from './authorize.js'
import interact from './interact/index.js'
import * as redis from './redis.js'
import * as pubsub from './pubsub.js'

export default async function coreSideEffects({
  session, domain, user, scope, active_type, patch, si, ii, send
}) {
  if (scope === 'sessions') {
    const { op, path, value } = patch[0]
    if (op === 'add' && path.length === 4 && path[0] === 'active' && path[1] === session) {
      try {
        if (path[2] === 'queries') {
          const { query, params=[], domain:targetDomain=domain } = value
          const queryId = path[3]
          const queryStart = Date.now()
          const { rows } = await configuredQuery(domain, targetDomain, query, params, user)
          const metricsPatch = [{ op: 'add', path: ['active', session, 'query', queryId, 'core_latency'], value: Date.now() - queryStart }]
          interact(domain, user, scope, metricsPatch)
          send({ si, ii, rows })
        }
        else if (path[2] === 'subscriptions') {
          const { scope: subscribedScope, user:scopeUser=user, domain:scopeDomain=domain } = value
          const id = await scopeToId(scopeDomain, scopeUser, subscribedScope)
          if (await authorize(user, domain, id)) {
            if (!subscriptions[session]) subscriptions[session] = {}

            const ss = subscriptions[session]
            if (!ss[id]) {
              ss[id] = subscribe(id, send, subscribedScope)
              let first = true
              pubsub.subscribe(id, update => {
                if (first) {
                  first = false
                  console.log('DO STATES EQUAL??????????????', update, state)
                }
              }, subscribedScope, user, domain)
            }

            const state = await redis.client.json.get(id)
            send({ ...state, id, si })
          }
          else {
            let error = `User ${user} Not Autorized To Access ${subscribedScope}`
            if (scopeDomain !== domain) error += ` in ${scopeDomain}`
            send({ si, ii, error })
          }
        }
        else send({ si, ii })
      }
      catch (error) {
        console.warn(error)
        console.warn(path, patch)
        send({ si, ii, error: error.code })
      }
    }
    else send({ si, ii })
  }
  else {
    const sideEffect = sideEffects[active_type] || (() => send({ si, ii }))
    await sideEffect({ domain, user, session, scope, patch, si, ii, send })
  }
}