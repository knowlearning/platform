import { environment, isUUID, uuid } from './utils.js'
import scopeToId from './scope-to-id.js'
import configuredQuery from './configured-query.js'
import { applyConfiguration } from './side-effects/configure.js'
import sideEffects from './side-effects/index.js'
import subscribe from './subscribe.js'
import authorize from './authorize.js'
import interact from './interact.js'
import { getState } from './persistence.js'
import coreState, { coreStateSynced } from './core-state.js'
import { domainAdmin } from './configuration.js'
import SESSION from './session.js'
import { guarantees, subscriptions } from './stateful.js'

const { ADMIN_DOMAIN, MODE } = environment

const SUPER_ADMINS = [
  'f74e9cb3-2b53-4c85-9b0c-f1d61b032b3f'
]

export default async function coreSideEffects({
  id, session, domain, user, scope, active_type, patch, si, ii, send
}) {
  if (scope === 'sessions') {
    const { op, path, value } = patch[0]
    if (path.length === 4 && path[0] === 'active' && path[1] === session) {
      try {
        if (op === 'add') {
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

              const state = await getState(subscribeId)
              send({ ...state, id: subscribeId, si })
            }
            else {
              let error = `User ${user} Not Autorized To Access ${subscribedScope}`
              if (scopeDomain !== domain) error += ` in ${scopeDomain}`
              send({ si, ii, error })
            }
          }
          else if (path[2] === 'guarantees') {
            if (!guarantees[session]) guarantees[session] = {}
            const guaranteeId = path[3]
            guarantees[session][guaranteeId] = value
          }
          else send({ si, ii })
        }
        if (op === 'remove') {
          if (path[2] === 'guarantees') {
            const guaranteeId = path[3]
            delete guarantees[session][guaranteeId]
          }
          else send({ si, ii })
        }
      }
      catch (error) {
        console.warn(error)
        console.warn(path, patch)
        send({ si, ii, error: error.code })
      }
    }
    else send({ si, ii })
  }
  else if (
    (domain === ADMIN_DOMAIN || isDevelopmentTest(domain))
    && scope.startsWith('configuration/')
  ) {
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
      const reportState = await coreState(ADMIN_DOMAIN, report, ADMIN_DOMAIN)
      const domainConfig = await coreState('core', 'domain-config', 'core')
      const coreConfigCopyId = uuid()
      const coreConfigCopy = await coreState(ADMIN_DOMAIN, coreConfigCopyId, 'core')
      domainConfig[configureDomain] = { config: coreConfigCopyId, report, admin: user, server: SESSION }

      reportState.tasks = {}
      reportState.start = Date.now()

      try {
        const configuration = await getState(id)
        Object.assign(coreConfigCopy, configuration.active)
        await coreStateSynced()
        await applyConfiguration(configureDomain, configuration.active, reportState)
        reportState.end = Date.now()
      }
      catch (error) {
        reportState.error = error.toString()
      }
    }
    send({ si, ii })
  }
  else {
    const sideEffect = sideEffects[active_type] || (() => send({ si, ii }))
    await sideEffect({ domain, user, session, scope, patch, si, ii, send })
  }
}

async function isAdmin(user, requestingDomain, requestedDomain) {
  return (
    requestedDomain.startsWith(`${user}.localhost:`)
    || (requestingDomain === ADMIN_DOMAIN && user === await domainAdmin(requestedDomain))
    || isDevelopmentTest(requestingDomain)
    || SUPER_ADMINS.includes(user)
  )
}

function isDevelopmentTest(domain) {
  return MODE === 'local' && (domain === 'localhost:5112' || domain === 'admin.knowlearning.systems')
}
