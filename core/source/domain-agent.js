import { uuid, writeFile, randomBytes } from './utils.js'
import configuration from './configuration.js'
import saveSession from './authenticate/save-session.js'
import handleConnection from './handle-connection.js'

const Agents = {}

export default function domainAgent(domain) {
  if (Agents[domain]) return Agents[domain]

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

      const postAuthenticationMessageQueue = []
      let connectionAuthenticated

      const postMessage = message => worker.postMessage(message)

      const connection = {
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
          delete Agents[domain]
          // TODO: clean up worker
          console.warn('WORKER CLOSED THROUGH CONNECTION!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        }
      }

      worker.onerror = event => console.log('DOMAIN AGENT ERROR', event)
      worker.onmessage = async ({ data }) => {
        console.log('MESSAGE FROM WORKER!!!!!!!!!!!!!!!', JSON.stringify(data))
        await sessionSave
        connection.onmessage(data)
      }

      //  TODO: use sid to create session for domain agent using saveSession
      const sid = randomBytes(32, 'hex')

      const sessionSave = saveSession(domain, uuid(), sid, domain, 'core', {
        user: domain,
        provider_id: domain,
        provider: 'core',
        info: { name: `${domain} Agent`, picture: null }
      })

      handleConnection(connection, domain, sid)
      resolve(connection)
    }
    else {
      delete Agents[domain]
      resolve()
    }
  })

  return Agents[domain]
}
