import { jwt, environment } from './utils.js'
import authenticate from './authenticate/index.js'
import interact from './interact/index.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import subscriptions from './subscriptions.js'
import coreSideEffects from './core-side-effects.js'
import domainAgent from './domain-agent.js'

const HEARTBEAT_INTERVAL = 5000
const SESSION_RECONNECTION_INTERVAL = 60000

const { AUTH_SERVICE_SECRET_KEY } = environment

const AUTH_SERVICE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA59Uz6jvBJF3B8/7xMqGo
XkIhLFvTCHuFIGuCNNZGCJUnSk2ne6Jp1ehUIarliJwzrvfr2HMe0PvzAJyZqQIs
uz0Lt867TTojCAKJunxbcrwEhzvz0FNjNu1wpgkSHFvd1uTvRSZqauqUmG0HqC17
HSmBaXivB49B/pviowVJc+mUJJ9MROtOiL4JN5niHnLbt6QVi6NITAJkOwtoRhck
5j0KLvfrq18R8QrfDOq3v5hWlrA6j1wPvTW1mzFk8MrOZw935mMDdMivFAm/DltM
NT5I3YnLZpcl1e/fydC+B6zSz2nZfLb2iDBbADDVj2+i9JUEFomg6ng1DjHUGMYc
ZQIDAQAB
-----END PUBLIC KEY-----
`

const activeConnections = {}
const sessionMessageIndexes = {}
const responseBuffers = {}
const outstandingSideEffects = {}
const reconnectionPromiseResolvers = {}

function reconnection(session) {
  return new Promise((resolve, reject) => {
    const reconnectionTimeout = setTimeout(reject, SESSION_RECONNECTION_INTERVAL)

    if (reconnectionPromiseResolvers[session]) {
      console.warn('DOUBLED UP CALLS TO RECONNECTION', session)
      reconnectionPromiseResolvers[session]()
    }
    reconnectionPromiseResolvers[session] = () => {
      clearTimeout(reconnectionTimeout)
      resolve()
      delete reconnectionPromiseResolvers[session]
    }
  })
}

export default async function handleConnection(connection, domain, sid) {
  let user, session, provider, heartbeatTimeout

  function close(data=null) {
    if (!user) return

    //  TODO: tear down listeners
    delete responseBuffers[session]
    delete activeConnections[session]
    delete outstandingSideEffects[session]

    if (subscriptions[session]) {
      Promise
        .all(Object.values[subscriptions[session]].map(unsub => unsub()))
        .catch(e => console.log(e))
      delete subscriptions[session]
    }

    interact(domain, user, 'sessions', [
      { op: 'add', path: ['active', session, 'close'], value: data  },
      { op: 'remove', path: ['active', session]  }
    ])

    domainAgent(domain).catch(() => null).then(agent => {
      if (agent && user && user !== domain) {
        agent.send({ type: 'close', session, data })
      }
    })
  }

  function heartbeat() {
    clearTimeout(heartbeatTimeout)
    heartbeatTimeout = setTimeout(
      () => {
        try {
          connection.send()
          heartbeat()
        }
        catch (error) {
          console.warn('Error sending heartbeat', domain, user, error)
        }
      },
      HEARTBEAT_INTERVAL
    )
  }

  heartbeat()

  function send(message) {
    //  this guard probably unnecessary if we properly stop watchers
    if (!responseBuffers[session]) return console.warn('SESSION CLOSED BUT RESPONSE SENT', JSON.stringify(message), session.slice(0,4))

    responseBuffers[session].push(message)

    if (activeConnections[session]) {
      try {
        activeConnections[session].send(message)
        heartbeat()
      }
      catch (error) {
        console.warn('ERROR SENDING OVER ACTIVE CONNECTION', error)
      }
    }
  }

  connection.onclose = async error => {
    clearTimeout(heartbeatTimeout)
    if (!session) return

    delete activeConnections[session]
    //  TODO: if no error passed to onclose, we can go ahead and
    //        close the session without waiting for reconnection
    if (error) reconnection(session).catch(() => close('reconnection error'))
    else close()
  }

  let lastAgent
  connection.onmessage = async message => {
    let agent = await domainAgent(domain).catch(() => null)

    if (agent && user && lastAgent !== agent) {
      // TODO: consider adding param so new agent instance knows
      //       that this is a reconnection of a previously connected
      //       and prematurely closed or un-closed session
      agent.send({ type: 'open', session, data: { user } })
    }

    lastAgent = agent

    if (!user) {
      console.log('GOT MESSAGE FOR CONNECTION WITHOUT USER!!!!!!!!!!!', message)
      try {  //  default to first message sid if present
        const authResponse = await authenticate(message, domain, message.sid || sid)
        user = authResponse.user
        provider = authResponse.provider
        session = authResponse.session

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] !== undefined) {
          if (reconnectionPromiseResolvers[session]) {
            reconnectionPromiseResolvers[session]()
          }
          else {
            connection.send({ error: 'Session reconnection failed' })
            connection.close()
            return
          }
        }
        else {
          sessionMessageIndexes[session] = -1
          responseBuffers[session] = []
          outstandingSideEffects[session] = {}
        }

        const JWT = await new Promise((resolve, reject) => {
          jwt.sign({ user, domain }, AUTH_SERVICE_SECRET_KEY, { algorithm: 'RS256' }, (error, token) => {
            if (error) reject(error)
            else resolve(token)
          })
        })

        connection.send({
          domain,
          server: SESSION,
          session,
          auth: { user, provider, info: authResponse.info, JWT },
          ack: sessionMessageIndexes[session]
        })

        activeConnections[session] = connection
        responseBuffers[session].forEach(r => connection.send(r))

        //  Only send open on initial session auth
        if (sessionMessageIndexes[session] === -1 && agent && user !== domain) {
          agent.send({ type: 'open', session, data: { user } })
        }
      }
      catch (error) {
        console.log('Error Authorizing Agent', error)
        try {
          connection.send({ error: 'First Message Must Be A Valid Auth Message' })
          connection.close()
        }
        catch (error) {
          console.warn('Error closing connection', error)
        }
      }
    }
    else {
      try {
        if (message.ack !== undefined) {
          const responseIndex = responseBuffers[session].findIndex(({ si }) => si === message.ack)
          responseBuffers[session].splice(0, responseIndex + 1)
        }
        else if (message.type === 'close') {
          if (message.info?.keepalive) {
            connection.close('Closed with keepalive by client')
          }
          else {
            close(message.info)
            session = undefined
            connection.close()
          }
        }
        else {
          const { scope, patch, si } = message

          if (si !== sessionMessageIndexes[session] + 1) console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)

          sessionMessageIndexes[session] = si

          const id = await scopeToId(domain, user, scope)
          if (!outstandingSideEffects[session][id]) outstandingSideEffects[session][id] = []

          await Promise.all(outstandingSideEffects[session][id])
          let resolveSideEffects
          outstandingSideEffects[session][id].push(new Promise(resolve => resolveSideEffects = resolve))

          const { ii, active_type } = await interact(domain, user, scope, patch)
          await coreSideEffects({ id, session, domain, user, scope, active_type, patch, si, ii, send })
          if (agent && user !== domain) {
            const data = { scope, patch, ii, id }
            agent.send({ type: 'mutate', session, data })
          }

          resolveSideEffects()
        }
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({
          si: message ? message.si : null,
          error: `ERROR PROCESSING MESSAGE`
        })
      }
    }
  }
}
