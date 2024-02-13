import authenticate from './authenticate/index.js'
import interact from './interact/index.js'
import scopeToId from './scope-to-id.js'
import SESSION from './session.js'
import coreSideEffects from './core-side-effects.js'
import domainSideEffects from './domain-side-effects.js'

const HEARTBEAT_INTERVAL = 5000

const sessionMessageIndexes = {}
const responseBuffers = {}
const activeConnections = {}
const outstandingSideEffects = {}

export default async function handleConnection(connection, domain, sid) {
  let user, session, provider, heartbeatTimeout

  function heartbeat() {
    clearTimeout(heartbeatTimeout)
    heartbeatTimeout = setTimeout(
      () => {
        try {
          connection.send('')
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
    responseBuffers[session].push(message)
    try {
      activeConnections[session].send(JSON.stringify(message))
      heartbeat()
    }
    catch (error) {
      console.warn('ERROR SENDING OVER ACTIVE CONNECTION')
      activeConnections[session].close()
    }
  }

  connection.onmessage = async message => {

    if (!user) {
      try {
        const authResponse = await authenticate(message, domain, sid)
        user = authResponse.user
        provider = authResponse.provider
        session = authResponse.session

        //  TODO: consider making this cross server
        if (sessionMessageIndexes[session] === undefined) sessionMessageIndexes[session] = -1
        if (!responseBuffers[session]) responseBuffers[session] = []

        connection.send(JSON.stringify({
          domain,
          server: SESSION,
          session,
          auth: { user, provider, info: authResponse.info },
          ack: sessionMessageIndexes[session]
        }))

        activeConnections[session] = connection
        responseBuffers[session].forEach(r => connection.send(JSON.stringify(r)))
      }
      catch (error) {
        console.log('Error Authorizing Agent', error)
        try {
          connection.send(JSON.stringify({ error: 'First Message Must Be A Valid Auth Message' }))
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
        else {

          const { scope, patch, si } = message

          if (si !== sessionMessageIndexes[session] + 1) console.warn(`SKIPPING MESSAGE INDEX! TODO: INVESTIGATE CAUSE ${sessionMessageIndexes[session]} -> ${si}`)

          sessionMessageIndexes[session] = si

          const resolveCurrentSideEffects = await resolvePreviousSideEffects(domain, user, scope, session)

          const { ii, active_type } = await interact(domain, user, scope, patch)

          const sideEffectEnvironment = { session, domain, user, scope, active_type, patch, si, ii, send }
          await coreSideEffects(sideEffectEnvironment)
          await domainSideEffects(sideEffectEnvironment)
          resolveCurrentSideEffects()
        }
      }
      catch (error) {
        console.warn('ERROR PROCESSING MESSAGE', error)
        send({ si: message.si, error: `ERROR PROCESSING MESSAGE` })
      }
    }
  }
}

async function resolvePreviousSideEffects(domain, user, scope, session) {
  const id = await scopeToId(domain, user, scope)

  await Promise.all(outstandingSideEffects?.[session]?.[id] || [])

  if (!outstandingSideEffects[session]) outstandingSideEffects[session] = {}
  if (!outstandingSideEffects[session][id]) outstandingSideEffects[session][id] = []
  let resolveSideEffects
  outstandingSideEffects[session][id].push(new Promise(resolve => resolveSideEffects = resolve))
  return resolveSideEffects
}