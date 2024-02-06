import { validate as isUUID, v4 as uuid } from 'uuid'
import authenticate from './authenticate/index.js'
import authorize from './authorize.js'
import interact from './interact/index.js'
import sideEffects from './side-effects/index.js'
import monitorWsConnection from './monitor-ws-connection.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import configuredQuery from './configured-query.js'
import * as redis from './redis.js'
import initializationState from './initialization-state.js'
import subscriptions from './subscriptions.js'
import subscribe from './subscribe.js'

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

  ensureDomainConfigured(domain)

  if (!sid) {
    console.warn(`Closing websocket due to missing sid for connection in domain: ${domain}`)
    ws.close()
  }

  const heartbeat = monitorWsConnection(ws)

  function send(message) {
    responseBuffers[session].push(message)
    activeWebsockets[session].send(JSON.stringify(message))
    heartbeat()
  }

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
  if (scope === 'sessions') {
    const { op, path, value } = patch[0]
    if (op === 'add' && path.length === 4 && path[0] === 'active' && path[1] === session) {
      try {
        if (path[2] === 'queries') {
          const { query, params=[], domain:targetDomain=domain } = value
          const queryId = path[3]
          const queryStart = Date.now()
          const { rows, fields } = await configuredQuery(domain, targetDomain, query, params, user)
          const metricsPatch = [{ op: 'add', path: ['active', session, 'query', queryId, 'core_latency'], value: Date.now() - queryStart }]
          interact(domain, user, id, metricsPatch)
          send({ si, ii, rows, columns: fields.map(f => f.name) })
        }
        else if (path[2] === 'subscriptions') {
          const { scope: subscribedScope, user:scopeUser=user, domain:scopeDomain=domain } = value

          const id = await scopeToId(scopeDomain, scopeUser, subscribedScope)
          if (await authorize(user, domain, id)) {
            if (!subscriptions[session]) subscriptions[session] = {}

            const ss = subscriptions[session]
            if (!ss[id]) ss[id] = subscribe(id, send, subscribedScope)

            const state = await redis.client.json.get(id)
            send({ ...state, id, si })
          }
          else {
            let error = `User ${user} Not Autorized To Access ${subscribedScope}`
            if (scopeDomain !== domain) error += ` in ${scopeDomain}`
            send({ si, ii, error })
          }
        }
        else send({ si, ii })
      }
      catch (error) {
        console.warn(error)
        console.warn(path, patch)
        send({ si, ii, error: error.code })
      }
    }
    else send({ si, ii })
  }
  else {
    const sideEffect = sideEffects[active_type] || (() => send({ si, ii }))
    await sideEffect({ domain, user, session, scope: id, patch, si, ii, send })
  }

/*
  console.log('DONE PROCESSING', si)
  resolve()
*/
}
