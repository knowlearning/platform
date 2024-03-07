import { uuid, writeFile, randomBytes } from './utils.js'
import configuration from './configuration.js'
import saveSession from './authenticate/save-session.js'
import handleConnection from './handle-connection.js'

const Agents = {}

async function createValidSession(domain, user) {
  const sid = randomBytes(32, 'hex')
  await saveSession(domain, uuid(), sid, user, 'core', {
    user: domain,
    provider_id: domain,
    provider: 'core',
    info: { name: `${domain} Agent`, picture: null }
  })
  return sid
}

function createConnection(worker, connectionId) {
  const postAuthenticationMessageQueue = []
  let connectionAuthenticated

  const postMessage = message => message ? worker.postMessage({...message, connection: connectionId}) : worker.postMessage()

  return {
    async send(message) {
      // TODO: consider more reliable/explicit recognintion of auth response method
      if (!message) postMessage() // heartbeat
      else if (message.server) {
        connectionAuthenticated = true
        postMessage(message)
        while (postAuthenticationMessageQueue.length) {
          postMessage(postAuthenticationMessageQueue.shift())
        }
      }
      else if (connectionAuthenticated) postMessage(message)
      else postAuthenticationMessageQueue.push(message)
    },
    close() {
      // TODO: clean up worker if domain main domain connection closed...
      console.warn('WORKER CLOSED THROUGH CONNECTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
    }
  }
}

export default function domainAgent(domain, refresh=false) {
  if (Agents[domain] && !refresh) return Agents[domain]

  Agents[domain] = new Promise(async resolve => {
    const config = await configuration(domain)
    if (config.agent) {
      const filename = `/core/source/${uuid()}.js`
      await writeFile(filename, config.agent)
      const workerUrl = new URL(filename, import.meta.url).href

      const worker = new Worker(workerUrl, {
        type: "module",
        deno: {
          permissions: {
            env: ['AGENT_TOKEN'],
            hrtime: false,
            net: false,
            ffi: false,
            read: false,
            run: false,
            write: false,
          },
        }
      })

      worker.onerror = event => {
        console.log('DOMAIN AGENT ERROR', event)
        //  Stop unhandled child error event from closing the core server
        event.preventDefault()
        // TODO: restart child process, probably with backoff and reporting to admin domain...
      }

      worker.onmessage = async ({ data }) => {
        if (!connections[data.connection]) {
          const connection = createConnection(worker, data.connection)
          if (data.domain === null) resolve(connection)
          const targetDomain = data.domain || domain
          const sid = await createValidSession(targetDomain, domain)
          handleConnection(connection, targetDomain, sid)
        }
        connections[data.connection].onmessage(data)
      }
    }
    else {
      delete Agents[domain]
      resolve()
    }
  })

  return Agents[domain]
}
