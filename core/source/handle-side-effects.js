import { evalFilter } from './utils.js'
import configuration from './configuration.js'
import executeWorkerScript from './execute-worker-script.js'

const currentConfig = {}

export default async function handleSideEffects({ domain, user, scope, patch, ii, id, context, session }) {
  if (domain === 'core') return

  const config = await configuration(domain)

  if (!config.agents) return

  const agentSideEffects = []

  const variables = { domain, user, scope, id, ii, patch, context, session, patch }

  const isNewConfig = config !== currentConfig[domain]
  currentConfig[domain] = config

  if (config.sideEffects) {
    const { script } = config.sideEffects
    executeWorkerScript(isNewConfig, domain, domain, script, variables, session)
  }
}
