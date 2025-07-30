import { evalFilter } from './utils.js'
import configuration from './configuration.js'
import executeWorkerScript from './execute-worker-script.js'

const currentConfig = {}

export default async function handleSideEffects({ domain, user, scope, patch, ii, id, context, session }) {
  if (domain === 'core') return

  const config = await configuration(domain)

  if (!config.agents) return

  const agentSideEffects = []
  const baseVariables = { domain, user, scope, id, ii, patch, context, session }

  await Promise.all(
    patch
      .map(async patchPart => {
        const variables = { ...baseVariables, ...patchPart }
        await Promise.all(
          config
            .agents
            .map(async ({ filter, script }) => {
              if (await evalFilter(filter, variables)) {
                agentSideEffects.push({ script, variables })
              }
            })
        )
      })
  )

  const isNewConfig = config !== currentConfig[domain]
  currentConfig[domain] = config

  //  TODO: be able to await side effect function run to execute side effects sequentially
  agentSideEffects.forEach(se => executeWorkerScript(isNewConfig, domain, domain, se.script, se.variables, session))
}
