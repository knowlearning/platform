import { environment, isUUID, uuid } from './utils.js';
import scopeToId from './scope-to-id.js'
import configuredQuery from './configured-query.js'
import { applyConfiguration } from './side-effects/configure.js'
import sideEffects from './side-effects/index.js'
import subscriptions from './subscriptions.js'
import subscribe from './subscribe.js'
import authorize from './authorize.js'
import interact from './interact/index.js'
import * as redis from './redis.js'
import coreState, { coreStateSynced } from './core-state.js'
import { domainAdmin } from './configuration.js'

const { ADMIN_DOMAIN } = environment

export default async function coreSideEffects({
  id, session, domain, user, scope, active_type, patch, si, ii, send
}) {
  if (scope === 'sessions') {
    const { op, path, value } = patch[0]
    if (op === 'add' && path.length === 4 && path[0] === 'active' && path[1] === session) {
      try {
        if (path[2] === 'queries') {
          const { query, params=[], domain:targetDomain=domain, context=[] } = value
          const queryId = path[3]
          const queryStart = Date.now()
          const { rows } = await configuredQuery(domain, targetDomain, query, params, user, context)
          const metricsPatch = [{ op: 'add', path: ['active', session, 'query', queryId, 'core_latency'], value: Date.now() - queryStart }]
          interact(domain, user, scope, metricsPatch)
          send({ si, ii, rows })
        }
        else if (path[2] === 'subscriptions') {
          const { scope: subscribedScope, user:scopeUser=user, domain:scopeDomain=domain } = value
          const subscribeId = await scopeToId(scopeDomain, scopeUser, subscribedScope)
          if (await authorize(user, domain, subscribeId)) {
            if (!subscriptions[session]) subscriptions[session] = {}

            const ss = subscriptions[session]
            if (!ss[subscribeId]) ss[subscribeId] = subscribe(subscribeId, send, subscribedScope)

            const state = await redis.client.json.get(subscribeId)
            send({ ...state, id: subscribeId, si })
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
  else if (domain === ADMIN_DOMAIN && scope.startsWith('configuration/')) {
    const { op, path, value } = patch[0]
    const configureDomain = scope.split('/')[1]
    if (
      (op === 'add' || op === 'replace')
      && path.length === 2
      && path[0] === 'active'
      && path[1] === 'deployment'
      && isUUID(value)
      && await isAdmin(user, domain, configureDomain)
    ) {
      const report = value
      const domainConfig = await coreState('core', 'domain-config', 'core')
      const coreConfigCopyId = uuid()
      const coreConfigCopy = await coreState(ADMIN_DOMAIN, coreConfigCopyId, 'core')
      domainConfig[configureDomain] = { config: coreConfigCopyId, report, admin: user }

      const reportState = await coreState(ADMIN_DOMAIN, report, ADMIN_DOMAIN)
      reportState.tasks = {}
      reportState.start = Date.now()

      try {
        const configuration = await redis.client.json.get(id)
        Object.assign(coreConfigCopy, configuration.active)
        await coreStateSynced()
        await applyConfiguration(configureDomain, configuration.active, reportState)
        reportState.end = Date.now()
      }
      catch (error) {
        reportState.error = error.toString()
      }

      send({ si, ii })
    }
  }
  else {
    const sideEffect = sideEffects[active_type] || (() => send({ si, ii }))
    await sideEffect({ domain, user, session, scope, patch, si, ii, send })
  }
}

async function isAdmin(user, requestingDomain, requestedDomain) {
  return true
  return (
       requestingDomain === 'localhost:5112'
    || requestedDomain.startsWith(`${user}.localhost:`)
    || (requestingDomain === ADMIN_DOMAIN && user === await domainAdmin(requestedDomain))
  )
}
