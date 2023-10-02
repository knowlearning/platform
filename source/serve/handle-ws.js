import { validate as isUUID, v4 as uuid } from 'uuid'
import authenticate from './authenticate/index.js'
import interact from './interact.js'
import postgresSideEffects from './side-effects/postgres.js'
import metadataSideEffects from './side-effects/metadata.js'
import sideEffects from './side-effects/index.js'
import pingWSConnection from './ping-ws-connection.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import { query } from './postgres.js'
import * as hash from './authenticate/hash.js'

const USER_TYPE = 'application/json;type=user'
const SESSION_TYPE = 'application/json;type=session'
const { ADMIN_DOMAIN } = process.env
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

  function sendAuthResponse() {
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

      if (!message.token) {
        try {
          const { rows } = await query(domain, `
            SELECT
              sessions.id as id,
              user_id,
              provider,
              created
            FROM sessions
            JOIN metadata
              ON metadata.id = sessions.id
            WHERE session_credential = $1
            ORDER BY created DESC LIMIT 1`,
            [session_credential]
          )
          if (rows[0]) {
            user = rows[0].user_id
            provider = rows[0].provider

            if (rows[0].id === message.session) {
              session = rows[0].id
              console.log('RECONNECTED SESSION FOR USER', user, provider, domain, session, session_credential)
            }
            else {
              session = uuid()
              await interact(domain, user, session, [
                { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
                {
                  op: 'add',
                  value: {
                    session_credential,
                    user_id: user,
                    provider
                  },
                  path: ['active']
                }
              ])
              await postgresSideEffects(domain, SESSION_TYPE, session)
              await metadataSideEffects(session)
            }

            if (sessionMessageIndexes[session] === undefined) sessionMessageIndexes[session] = -1
            if (!responseBuffers[session]) responseBuffers[session] = []

            //  TODO: call this in 1 function rather than repeating below
            sendAuthResponse()
            return
          }
        }
        catch (error) {
          console.warn('error reconnecting session', error)
        }
      }

      try {
        const authority = domain === 'core' ? 'core' : 'JWT'
        const authResponse = await authenticate(message.token, authority)
        user = authResponse.user
        session = uuid()
        console.log('NEW SESSION FOR USER', user, domain, session)

        //  TODO: consider storing at domain instead of core
        const { provider_id, credential } = authResponse
        provider = authResponse.provider

        const userPatch = [
          { op: 'add', value: USER_TYPE, path: ['active_type'] },
          { op: 'add', value: { provider_id, provider, credential }, path: ['active'] }
        ]
        await interact(ADMIN_DOMAIN, 'users', user, userPatch)
        await postgresSideEffects(ADMIN_DOMAIN, USER_TYPE, user)
        await metadataSideEffects(user)

        const sessionPatch = [
          { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
          {
            op: 'add',
            value: {
              session_credential,
              user_id: user,
              provider,
              start: Date.now()
            },
            path: ['active']
          }
        ]
        await interact(domain, user, session, sessionPatch)
        //  TODO: sessions should belong to domain instead of ADMIN_DOMAIN
        //        or maybe both, like metadata...
        await postgresSideEffects(ADMIN_DOMAIN, SESSION_TYPE, session)
        await metadataSideEffects(session)

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] === undefined) sessionMessageIndexes[session] = -1
        if (!responseBuffers[session]) responseBuffers[session] = []

        sendAuthResponse()
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
async function processMessage(domain, user, session, namedScopeCache, { ack, scope, patch, si }, send) {
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

  await metadataSideEffects(id)
  await postgresSideEffects(domain, active_type, id)

  // TODO: remove special scope based side effects
  const sideEffect = sideEffects[active_type] || sideEffects[scope] || (() => send({ si, ii }))
  await sideEffect(domain, user, session, patch, si, ii, send)

/*
  console.log('DONE PROCESSING', si)
  resolve()
*/
}