import configuration from '../configuration.js'
import createAgent from './create-agent.js'
import { activeConnectionInfo, DomainAgents } from '../stateful.js'

const domainAgentGenerations = {}

export default function domainAgent(domain, refresh=false) {
  if (DomainAgents[domain]) {
    if (!refresh) return DomainAgents[domain]

    closeExistingDomainAgent(domain)
  }

  const generation = (domainAgentGenerations[domain] || 0) + 1
  domainAgentGenerations[domain] = generation

  let closeCurrentAgent = null

  const agentPromise = (async () => {
    const config = await configuration(domain)
    if (config.agent) {
      try {
        const pendingAgent = createAgent(domain, config.agent, config.secrets, DomainAgents, generation)
        closeCurrentAgent = () => pendingAgent.close?.()
        const domainAgent = await pendingAgent
        reopenActiveSessions(domain, domainAgent)
        return domainAgent
      }
      catch (error) {
        if (DomainAgents[domain]?.generation === generation) delete DomainAgents[domain]
        throw error
      }
    }
    else {
      if (DomainAgents[domain]?.generation === generation) delete DomainAgents[domain]
    }
  })()

  agentPromise.generation = generation
  agentPromise.close = () => closeCurrentAgent?.()
  DomainAgents[domain] = agentPromise
  return agentPromise
}

export function stopDomainAgent(domain) {
  domainAgentGenerations[domain] = (domainAgentGenerations[domain] || 0) + 1
  closeExistingDomainAgent(domain)
}

function closeExistingDomainAgent(domain) {
  const previousAgent = DomainAgents[domain]
  delete DomainAgents[domain]

  if (!previousAgent) return
  if (previousAgent.close) closeAgent(previousAgent)
  else {
    previousAgent
      .then(agent => closeAgent(agent))
      .catch(() => null)
  }
}

function closeAgent(agent) {
  if (!agent) return
  agent.closed = true
  agent.onclose?.()
  agent.close?.()
}

function reopenActiveSessions(domain, agent) {
  for (const [session, info] of Object.entries(activeConnectionInfo)) {
    if (info.domain === domain && info.user && info.user !== domain) {
      agent.send({ type: 'open', session, data: { user: info.user } })
    }
  }
}
