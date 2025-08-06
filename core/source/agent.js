import { applyPatch, Agent, uuid } from './utils.js'
import handleConnection from './handle-connection.js'
import createSession from './domain-agent/create-session.js'
import { agents } from './stateful.js'

function getAgent(domain, forceNew) {
  if (agents[domain] && !forceNew) return agents[domain]

  const agent = new Agent({
    Connection: function () {
      this.send = async message => {
        await sessionCreated
        connection.onmessage(message)
      }

      const connection = createConnection(this, domain)
      const sessionCreated = (
        createSession(domain, 'node')
          .then(sid => {
            handleConnection(connection, domain, sid)
          })
      )

      // TODO: consider what onclose and onerror mean
      setTimeout(() => this.onopen())

      return this
    },
    domain,
    token: () => '',
    uuid,
    async log() {
      await new Promise(r => setTimeout(r)) // so we can access our own agent instance

      const { session } = await agent.environment()
      let value

      try {
        value = structuredClone([...arguments])
      }
      catch (error) {
        value = `ERROR: error occurred logging arguments ${error} ${arguments}`
      }

      agent.interact('sessions', [{ op: 'add', path: ['active', session, 'log'], value }], false)
    },
    fetch,
    applyPatch,
    reboot: () => {}
  })

  agents[domain] = agent

  return agent
}

function createConnection(agentConnection, domain) {
  let queue = []
  let closed = false

  return {
    async send(message) {
      if (closed) console.warn('MESSAGE SENT TO CLOSED CONNECTION', message)
      else if (!message) agentConnection.onmessage() // heartbeat
      else if (message.server) {
        // TODO: consider more reliable/explicit recognintion of auth response method
        agentConnection.onmessage(message)
        while (queue.length) send(queue.shift())
        queue = null
      }
      else if (queue) queue.push(message)
      else agentConnection.onmessage(message)
    },
    close(info) {
      console.warn('WORKER CLOSED THROUGH CONNECTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', info)
      closed = true
    }
  }
}

export default getAgent('core')
export { getAgent }
