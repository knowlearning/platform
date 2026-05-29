import { jwt, environment } from './utils.js'
import authenticate from './authenticate/index.js'
import interact from './interact.js'
import scopeToId from './scope-to-id.js'
import subscribe from './subscribe.js'
import authorize from './authorize.js'
import { getState } from './persistence.js'
import SESSION from './session.js'
import coreSideEffects from './core-side-effects.js'
import handleGuarantee from './handle-guarantee.js'
import handleSideEffects from './handle-side-effects.js'
import domainAgent from './domain-agent/index.js'
import {
  guarantees,
  activeConnections,
  activeConnectionInfo,
  sessionMessageIndexes,
  responseBuffers,
  outstandingSideEffects,
  reconnectionPromiseResolvers,
  subscriptions
} from './stateful.js'

const {
  AUTH_SERVICE_SECRET_KEY,
  PUBLIC_ENCRYPTION_KEY,
  SESSION_RECONNECTION_INTERVAL = 60_000,
  HEARTBEAT_INTERVAL = 5_000
} = environment

const DOMAIN_AGENT_WAIT_TIMEOUT = 500

function reconnection(session) {
  return new Promise((resolve, reject) => {
    const reconnectionTimeout = setTimeout(() => {
      console.log('RECONNECTION TIMEOUT')
      delete reconnectionPromiseResolvers[session]
      reject()
    }, SESSION_RECONNECTION_INTERVAL)

    if (reconnectionPromiseResolvers[session]) {
      console.warn('DOUBLED UP CALLS TO RECONNECTION', session)
      reconnectionPromiseResolvers[session]()
    }
    reconnectionPromiseResolvers[session] = () => {
      clearTimeout(reconnectionTimeout)
      console.log('RECONNECTION RESOLVED', session)
      resolve()
      delete reconnectionPromiseResolvers[session]
    }
  })
}

export default async function handleConnection(connection, domain, sid, metricsPromise, secrets={}) {
  let user, session, provider, heartbeatTimeout, abortConnection

  function ensureSessionState(targetSession) {
    if (!responseBuffers[targetSession]) responseBuffers[targetSession] = []
    if (!outstandingSideEffects[targetSession]) outstandingSideEffects[targetSession] = {}
  }

  async function restoreSubscriptions(targetSession) {
    if (subscriptions[targetSession]) return

    let persistedSubscriptions
    try {
      const sessions = await getState(domain, 'sessions')
      persistedSubscriptions = sessions?.active?.[targetSession]?.subscriptions
    }
    catch (error) {
      console.warn('ERROR RESTORING SESSION SUBSCRIPTIONS', domain, user, targetSession, error)
      return
    }

    if (!persistedSubscriptions) return

    subscriptions[targetSession] = {}
    await Promise.all(
      Object
        .values(persistedSubscriptions)
        .map(async subscription => {
          try {
            if (!subscription) return

            const { scope: subscribedScope, user: scopeUser=user, domain: scopeDomain=domain } = subscription
            const subscribeId = await scopeToId(scopeDomain, scopeUser, subscribedScope)

            if (!subscriptions[targetSession][subscribeId] && await authorize(user, domain, subscribeId)) {
              subscriptions[targetSession][subscribeId] = subscribe(subscribeId, send, subscribedScope)
            }
          }
          catch (error) {
            console.warn('ERROR RESTORING SESSION SUBSCRIPTION', domain, user, targetSession, subscription, error)
          }
        })
    )

    if (Object.keys(subscriptions[targetSession]).length === 0) delete subscriptions[targetSession]
  }

  function close(data=null, targetSession=session) {
    if (!user || !targetSession) return

    const activeConnection = activeConnections[targetSession]
    if (activeConnection && activeConnection !== connection) return

    metricsPromise
      ?.then(m => delete m.connections[targetSession])
      .catch(error => {
        console.log('ERROR removing connection data', domain, user, targetSession, error)
      }) // TODO: assess if missed case here on reconnect attempt

    //  TODO: tear down listeners
    delete activeConnections[targetSession]
    delete activeConnectionInfo[targetSession]
    delete sessionMessageIndexes[targetSession]
    delete responseBuffers[targetSession]
    delete outstandingSideEffects[targetSession]

    if (subscriptions[targetSession]) {
      Promise
        .all(
          Object
            .values(subscriptions[targetSession])
            .map(unsub => unsub())
         )
        .catch(e => console.log(e))
      delete subscriptions[targetSession]
    }

    if (guarantees[targetSession]) {
      Promise
        .all(
          Object
            .values(guarantees[targetSession])
            .map(guarantee => handleGuarantee(domain, user, targetSession, guarantee))
         )
        .catch(e => console.log(e))
      delete guarantees[targetSession]
    }

    interact(domain, user, 'sessions', [
      { op: 'add', path: ['active', targetSession, 'close'], value: data  },
      { op: 'remove', path: ['active', targetSession]  }
    ])

    domainAgent(domain).catch(() => null).then(agent => {
      if (agent && user && user !== domain) {
        agent.send({ type: 'close', session: targetSession, data })
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
    if (user && session) {
      const closingSession = session
      if (activeConnections[closingSession] === connection) delete activeConnections[closingSession]
      if (error) reconnection(closingSession).catch(() => close('reconnection error', closingSession))
      else close(null, closingSession)
    }
    else if (!user) abortConnection = true
  }

  let lastAgent
  connection.onmessage = async message => {
    let agent = await availableDomainAgent(domain)

    if (agent && user && lastAgent !== agent) {
      // TODO: consider adding param so new agent instance knows
      //       that this is a reconnection of a previously connected
      //       and prematurely closed or un-closed session
      agent.send({ type: 'open', session, data: { user } })
    }

    lastAgent = agent

    if (!user) {
      console.log('GOT MESSAGE FOR CONNECTION WITHOUT USER!!!!!!!!!!!', message.domain)
      try {  //  default to first message sid if present
        const authResponse = await authenticate(message, domain, message.sid || sid)

        if (abortConnection) return

        user = authResponse.user
        provider = authResponse.provider
        session = authResponse.session

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] !== undefined) {
          ensureSessionState(session)
          await restoreSubscriptions(session)
          reconnectionPromiseResolvers[session]?.()
        }
        else {
          if (domain !== 'core') {
            metricsPromise
              ?.then(metrics => {
                if (abortConnection) console.log('CONNECTION ABORTED BEFORE SESSION ESTABLISHED', domain, user, session)
                else metrics.connections[session] = { user, domain }
              })
              .catch(error => console.log('ERROR INITIALIZING METRICS', user, domain, session))
          }
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
          serverPublicKey: PUBLIC_ENCRYPTION_KEY,
          session,
          auth: { user, provider, info: authResponse.info, JWT },
          ack: sessionMessageIndexes[session],
          secrets
        })

        activeConnections[session] = connection
        activeConnectionInfo[session] = { user, domain }
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
          const { scope, patch, context, si } = message

          if (si !== sessionMessageIndexes[session] + 1) console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)

          sessionMessageIndexes[session] = si

          const id = await scopeToId(domain, user, scope)
          if (!outstandingSideEffects[session][id]) outstandingSideEffects[session][id] = []

          await Promise.all(outstandingSideEffects[session][id])
          let resolveSideEffects
          outstandingSideEffects[session][id].push(new Promise(resolve => resolveSideEffects = resolve))

          const log = []
          let response
          const isSessionQuery = scope === 'sessions' && patch[0]?.path?.[2] === 'queries'
          const domainSideEffectResponse = (
            handleSideEffects({ domain, user, scope, patch, id, context, session })
              .then(r => response = r)
              .catch(error => log.push(error))
          )
          const { ii, active_type } = await interact(domain, user, scope, patch, context)

          await coreSideEffects({
            id, session, domain, user, scope, active_type, patch, si, ii,
            send: async message => {
              if (isSessionQuery) {
                send(message)
                return
              }

              return domainSideEffectResponse
                .finally(() => {
                  message.log = log
                  message.response = response
                  send(message)
                })
            }
          })
          if (agent && user !== domain) {
            const data = { scope, patch, ii, id, context }
            agent.send({ type: 'mutate', session, data, context })
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

function availableDomainAgent(domain) {
  return Promise.race([
    domainAgent(domain).catch(() => null),
    new Promise(resolve => setTimeout(() => resolve(null), DOMAIN_AGENT_WAIT_TIMEOUT))
  ])
}
