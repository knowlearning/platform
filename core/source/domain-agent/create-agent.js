import { uuid } from '../utils.js'
import coreState from '../core-state.js'
import handleConnection from '../handle-connection.js'
import createSession from './create-session.js'
import createConnection from './create-connection.js'
import { domainAgentConnections as connections } from '../stateful.js'

const HEARTBEAT_INTERVAL = 5000

export default function createAgent(domain, script, secrets={}, DomainAgents) {
  return new Promise(async (resolve, reject) => {
    //  Initialize new session to make core logs
    const agentSessions = await coreState(domain, 'sessions', domain)
    const coreSessionId = uuid()
    agentSessions[coreSessionId] = { log: 'Initialized new agent' }
    const coreSession = agentSessions[coreSessionId]

    const workerUrl = URL.createObjectURL(new Blob([script], { type: "application/javascript" }))
    const worker = new Worker(workerUrl, { type: "module" })

    worker.onerror = event => {
      coreSession.log = prettyPrintErrorEvent(event)
      reject(event)
      //  Stop unhandled child error event from closing the core server
      event.preventDefault()

      //  remove domain agent from rotation so it will be reinitialized on next ask
      delete DomainAgents[domain]
      worker.terminate()
    }

    worker.onmessage = async ({ data }) => {
      if (!data) {
        //  clear ping response expectationtimeout
        return
      }
      const isConnection = Object.hasOwn(data, 'token')
      if (isConnection) {
        connections[data.connection] = createConnection(worker, data.connection, domain, DomainAgents)

        if (data.domain === null) {
          resolve(connections[data.connection])
          DomainAgents[domain] = Promise.resolve(connections[data.connection])
        }

        const targetDomain = data.domain || domain
        const sid = await createSession(targetDomain, domain)
        handleConnection(connections[data.connection], targetDomain, sid)
      }
      connections[data.connection].onmessage(data)
    }
  })
}

function prettyPrintErrorEvent(error) {
  return `${error.message}
line: ${error.lineno}, column: ${error.colno}
`
}