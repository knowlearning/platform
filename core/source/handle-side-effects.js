import { evalFilter } from './utils.js'
import configuration from './configuration.js'
import executeWorkerScript from './execute-worker-script.js'
import { configCache } from './stateful.js'

export default async function handleSideEffects({ domain, user, scope, patch, ii, id, context, session }) {
  if (domain === 'core') return

  const cachedConfig = configCache[domain]

  const config = await configuration(domain)

  if (!config.sideEffects || user === domain) return

  const variables = {
    domain,
    user,
    scope,
    id,
    ii,
    context,
    session,
    patch: ( // only pass operations on active state
      patch
        .filter(op => op.path?.[0] === 'active')
        .map(op => ({...op, path: op.path.slice(1) }))
    )
  }

  const isNewConfig = config !== cachedConfig

  const { script } = config.sideEffects
  return executeWorkerScript(isNewConfig, domain, domain, script, variables, session)
}
