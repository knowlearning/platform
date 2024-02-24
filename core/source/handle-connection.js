import authenticate from './authenticate/index.js'
import interact from './interact/index.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import coreSideEffects from './core-side-effects.js'
import domainAgent from './domain-agent.js'

const HEARTBEAT_INTERVAL = 5000
const SESSION_RECONNECTION_INTERVAL = 60000

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

  const agentPromise = domainAgent(domain)

  function close(data) {
    //  TODO: tear down listeners
    delete responseBuffers[session]
    delete activeConnections[session]
    delete outstandingSideEffects[session]
    //  TODO: possibly pass along close info in data param (ex. error)
    agentPromise.then(agent => {
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
          console.warn('Error sending heartbeat', error)
          console.log(connection, domain, sid)
        }
      },
      HEARTBEAT_INTERVAL
    )
  }

  heartbeat()

  function send(message) {
    //  this guard probably unnecessary if we properly stop watchers
    if (!responseBuffers[session]) return console.warn('SESSION CLOSED BUT RESPONSE SENT', message, session.slice(0,4))

    responseBuffers[session].push(message)
    try {
      activeConnections[session].send(message)
      heartbeat()
    }
    catch (error) {
      console.warn('ERROR SENDING OVER ACTIVE CONNECTION', error)
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

  connection.onmessage = async message => {
    const agent = await agentPromise

    if (!user) {
      console.log('GOT MESSAGE FOR CONNECTION WITHOUT USER!!!!!!!!!!!', message)
      try {
        const authResponse = await authenticate(message, domain, sid)
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

        connection.send({
          domain,
          server: SESSION,
          session,
          auth: { user, provider, info: authResponse.info },
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
          await coreSideEffects({ session, domain, user, scope, active_type, patch, si, ii, send })
          if (agent && user !== domain) {
            const data = { scope, patch, ii }
            agent.send({ type: 'mutate', session, data })
          }

          resolveSideEffects()
        }
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({ si: message.si, error: `ERROR PROCESSING MESSAGE` })
      }
    }
  }
}
