import configuration from '../configuration.js'
import createAgent from './create-agent.js'

const DomainAgents = {}

export default function domainAgent(domain, refresh=false) {
  if (DomainAgents[domain]) {
    if (!refresh) return DomainAgents[domain]

    DomainAgents[domain]
      .then(agent => {
        agent.closed = true
        agent.onclose?.()
        agent.close()
      })
  }

  return DomainAgents[domain] = new Promise(async (resolve, reject) => {
    const config = await configuration(domain)

    if (config.agent) {
      try {
        const domainAgent = await createAgent(domain, config.agent, DomainAgents)
        resolve(domainAgent)
      }
      catch (error) {
        reject(error)
        delete DomainAgents[domain]
      }
    }
    else {
      resolve()
      delete DomainAgents[domain]
    }
  })
}
