import authenticate from './authenticate/index.js'
import interact from './interact/index.js'
import monitorWsConnection from './monitor-ws-connection.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import coreSideEffects from './core-side-effects.js'
import domainSideEffects from './domain-side-effects.js'

const sessionMessageIndexes = {}
const responseBuffers = {}
const activeWebsockets = {}

export default async function handleWebsocket(ws, domain, sid) {
  let user, session, provider

  await ensureDomainConfigured(domain)

  const heartbeat = monitorWsConnection(ws)

  function send(message) {
    responseBuffers[session].push(message)
    if (activeWebsockets[session].readyState === 1) {
      activeWebsockets[session].send(JSON.stringify(message))
      heartbeat()
    }
  }

  ws.addEventListener('message', async ({ data }) => {
    let message

    try { message = JSON.parse(data) }
    catch (error) {
      console.warn(error)
      send({ error: 'Error Parsing Message' })
      return
    }

    if (!user) {
      try {
        const authResponse = await authenticate(message, domain, sid)
        user = authResponse.user
        provider = authResponse.provider
        session = authResponse.session

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] === undefined) sessionMessageIndexes[session] = -1
        if (!responseBuffers[session]) responseBuffers[session] = []

        ws.send(JSON.stringify({
          domain,
          server: SESSION,
          session,
          auth: { user, provider, info: authResponse.info },
          ack: sessionMessageIndexes[session]
        }))

        activeWebsockets[session] = ws
        responseBuffers[session].forEach(r => ws.send(JSON.stringify(r)))
      }
      catch (error) {
        console.log('Error Authorizing Agent', error)
        ws.send(JSON.stringify({ error: 'First Message Must Be A Valid Auth Message' }))
        ws.close()
      }
    }
    else {
      try {
        if (message.ack !== undefined) {
          const responseIndex = responseBuffers[session].findIndex(({ si }) => si === message.ack)
          responseBuffers[session].splice(0, responseIndex + 1)
        }
        else {
          const { scope, patch, si } = message

          if (si !== sessionMessageIndexes[session] + 1) console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)

          sessionMessageIndexes[session] = si

          const { ii, active_type } = await interact(domain, user, scope, patch)
          const sideEffectEnvironment = { session, domain, user, scope, active_type, patch, si, ii, send }
          await coreSideEffects(sideEffectEnvironment)
          await domainSideEffects(sideEffectEnvironment)
        }
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({ si: message.si, error: `ERROR PROCESSING MESSAGE` })
      }
    }
  })
}
