import { uuid, writeFile, randomBytes } from './utils.js'
import configuration from './configuration.js'
import saveSession from './authenticate/save-session.js'
import handleConnection from './handle-connection.js'

const domainAgents = {}

function getAgent(domain) {
  if (domainAgents[domain]) return domainAgents[domain]

  domainAgents[domain] = new Promise(async resolve => {
    const config = await configuration(domain)
    if (config.agent) {
      const filename = `/core/source/${uuid()}.js`
      await writeFile(filename, config.agent)
      const workerUrl = new URL(filename, import.meta.url).href
      const worker = new Worker(workerUrl, { type: "module", })

      const connection = {
        send(data) { worker.postMessage({ data }) },
        close() {
          delete domainAgents[domain]
          // TODO: clean up worker
          console.warn('WORKER CLOSED THROUGH CONNECTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        }
      }

      worker.onerror = event => console.log('DOMAIN AGENT ERROR', event)
      worker.onmessage = ({ data }) => {
        console.log('MESSAGE FROM WORKER!!!!!!!!!!!!!!!', data, typeof data)
        connection.onmessage(data)
      }

      const sid = randomBytes(128)
      //  TODO: use sid to create session for domain agent using saveSession
      handleConnection(connection, domain, sid)

      resolve(connection)
    }
    else {
      delete domainAgents[domain]
      resolve()
    }
  })

  return domainAgents[domain]
}

export default async function domainSideEffects({ domain, active_type }) {
  const domainAgent = await getAgent(domain)
}