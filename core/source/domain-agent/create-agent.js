import { uuid } from '../utils.js'
import coreState from '../core-state.js'
import handleConnection from '../handle-connection.js'
import createSession from './create-session.js'
import createConnection from './create-connection.js'
import { domainAgentConnections as connections } from '../stateful.js'

const HEARTBEAT_INTERVAL = 5000

export default function createAgent(domain, script, secrets={}, DomainAgents, generation) {
  let rejectStartup
  let stopped = false
  let worker

  const agentPromise = (async () => {
    //  Initialize new session to make core logs
    const agentSessions = await coreState(domain, 'sessions', domain)
    const coreSessionId = uuid()
    agentSessions[coreSessionId] = { log: 'Initialized new agent' }
    const coreSession = agentSessions[coreSessionId]

    if (stopped) throw new Error('Domain agent stopped before startup')

    const workerUrl = URL.createObjectURL(new Blob([script], { type: "application/javascript" }))
    worker = new Worker(workerUrl, { type: "module" })

    return await new Promise((resolve, reject) => {
      rejectStartup = reject

      worker.onerror = event => {
        coreSession.log = prettyPrintErrorEvent(event)
        reject(event)
        //  Stop unhandled child error event from closing the core server
        event.preventDefault()

        stop()
      }

      worker.onmessage = async ({ data }) => {
        if (DomainAgents[domain]?.generation !== generation) {
          stop()
          return
        }
        if (!data) {
          //  clear ping response expectationtimeout
          return
        }
        const isConnection = Object.hasOwn(data, 'token')
        if (isConnection) {
          connections[data.connection] = createConnection(worker, data.connection, domain, DomainAgents, generation)

          if (data.domain === null) {
            const connection = connections[data.connection]
            resolve(connection)
            const resolvedAgent = Promise.resolve(connections[data.connection])
            resolvedAgent.close = () => {
              connection.closed = true
              connection.onclose?.()
              connection.close?.()
            }
            resolvedAgent.generation = generation
            if (DomainAgents[domain]?.generation === generation) DomainAgents[domain] = resolvedAgent
          }

          const targetDomain = data.domain || domain
          const sid = await createSession(targetDomain, domain)
          handleConnection(connections[data.connection], targetDomain, sid)
        }
        connections[data.connection].onmessage(data)
      }
    })
  })()

  function stop() {
    stopped = true
    rejectStartup?.(new Error('Domain agent stopped'))
    if (DomainAgents[domain]?.generation === generation) delete DomainAgents[domain]
    worker?.terminate()
  }

  agentPromise.close = stop
  return agentPromise
}

function prettyPrintErrorEvent(error) {
  return `${error.message}
line: ${error.lineno}, column: ${error.colno}
`
}
