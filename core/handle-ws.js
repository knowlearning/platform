import { validate as isUUID, v4 as uuid } from 'uuid'
import authenticate from './authenticate/index.js'
import interact from './interact/index.js'
import sideEffects from './side-effects/index.js'
import pingWSConnection from './ping-ws-connection.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import * as hash from './authenticate/hash.js'
import { ensureDomainConfigured } from './side-effects/configure.js'

const CLIENT_PING_INTERVAL = 10000
const HEARTBEAT_INTERVAL = 5000

const sessionMessageIndexes = {}
const responseBuffers = {}
const activeWebsockets = {}

function parseCookies(s) {
  return Object.fromEntries(
    s.split(';').map(p => p.split('='))
  )
}

export default async function handleWebsocket(ws, upgradeReq) {
  let user, session, provider
  const cookies = parseCookies(upgradeReq.headers.cookie || '=')
  const sid = cookies.sid

  const namedScopeCache = {}
  const origin = upgradeReq.headers.origin || 'https://core'  //  TODO: domain should probably be "development", "staging" or "production" based on mode...
  const { host: domain } = new URL(upgradeReq.url, origin)

  await ensureDomainConfigured(domain)

  if (!sid) {
    console.warn(`Closing websocket due to missing sid for connection in domain: ${domain}`)
    ws.close()
  }

  let heartbeatTimeout
  function heartbeat() {
    clearTimeout(heartbeatTimeout)
    heartbeatTimeout = setTimeout(
      () => {
        if (ws.readyState === 1) {
          ws.send('')
          heartbeat()
        }
      },
      HEARTBEAT_INTERVAL
    )
  }
  heartbeat()

  function send(message) {
    responseBuffers[session].push(message)
    activeWebsockets[session].send(JSON.stringify(message))
    heartbeat()
  }

  pingWSConnection(ws, CLIENT_PING_INTERVAL)

  ws.on('message', async messageBuffer => {
    let message

    try {
      message = JSON.parse(messageBuffer)
    }
    catch (error) {
      console.warn(error)
      send({ error: 'Error Parsing Message' })
      return
    }

    if (!user) {
      const session_credential = await hash.create(sid)
      try {
        const authResponse = await authenticate(message, domain, session_credential)
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
          auth: { user, provider },
          ack: sessionMessageIndexes[session]
        }))

        activeWebsockets[session] = ws
        responseBuffers[session].forEach(r => ws.send(JSON.stringify(r)))
      }
      catch (error) {
        console.log(error)
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
        else await processMessage(domain, user, session, namedScopeCache, message, send)
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({ si: message.si, error: `ERROR PROCESSING MESSAGE` })
      }
    }
  })
}

// let currentMessagePromise = null

// TODO: don't need to dereference ack in params
async function processMessage(domain, user, session, namedScopeCache, { scope, patch, si }, send) {
/* TODO: decide if we want to allow special "synced" mode
  if (si) console.log('QUEUING', si)
  const prevMessagePromise = currentMessagePromise
  let resolve
  currentMessagePromise = new Promise(r => resolve = r)
  await prevMessagePromise
  console.log('PROCESSING', si)
*/

  //  TODO: make sure to handle multiple member patches
  //  TODO: consider removing client based timestamp

  if (si !== sessionMessageIndexes[session] + 1) {
    console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)
  }
  sessionMessageIndexes[session] = si

  const id = namedScopeCache[scope] || await scopeToId(domain, user, scope)

  if (id !== scope) namedScopeCache[scope] = id

  const { ii, active_type } = await interact(domain, user, id, patch)

  // TODO: remove special scope based side effects
  const sideEffect = sideEffects[active_type] || sideEffects[scope] || (() => send({ si, ii }))
  await sideEffect(domain, user, session, patch, si, ii, send)

/*
  console.log('DONE PROCESSING', si)
  resolve()
*/
}
