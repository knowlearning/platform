import { validate as isUUID } from 'uuid'
import { standardJSONPatch } from '@knowlearning/patch-proxy'
import pkg from '../../package.json' assert { type: 'json' }

const HEARTBEAT_TIMEOUT = 10000
const DOMAIN_MESSAGES = { open: true, mutate: true, close: true }
const NOOP_ACK = -1

function activePatch(patch) {
  return structuredClone(patch).filter(({ path }) => 'active' === path.shift())
}

export default function messageQueue({ token, sid, domain, Connection, watchers, states, applyPatch, log, login, reboot, handleDomainMessage, trigger, variables={} }) {
  let connection
  let user
  let authed = false
  let session
  let server
  let si = -1
  let failedConnections = 0
  const messageQueue = []
  let lastSentSI = -1
  let lastHeartbeat
  let lastSynchronousScopePatched = null
  let lastSynchronousScopePatchPromise = null
  let restarting = false
  let disconnected = false
  let lastConfirmedSI = -1
  let sessionSID
  const outstandingSyncPromises = []
  const responses = {}


  let resolveEnvironment
  const environmentPromise = new Promise(r => resolveEnvironment = r)

  const sessionMetrics = {
    loaded: Date.now(),
    connected: null,
    authenticated: null
  }

  async function environment() {
    const { version } = pkg
    return {
      variables,
      ...(await environmentPromise),
      context: [],
      version
    }
  }

  function queueMessage({ scope, patch, context }) {
    if (lastSynchronousScopePatched === scope) {
      const i = messageQueue.length - 1
      messageQueue[i].patch = [...messageQueue[i].patch, ...patch]
    }
    else {
      si += 1
      lastSynchronousScopePatchPromise = new Promise((resolve, reject) => responses[si] = [[resolve, reject]])
      messageQueue.push({ scope, patch, context, si, ts: Date.now()})
      lastSynchronousScopePatched = scope
      flushMessageQueue()
    }

    return lastSynchronousScopePatchPromise
  }

  // TODO: clear acknowledged messages
  async function flushMessageQueue() {
    // this makes flushing async, giving time for queue message to combine synchronous updates
    await new Promise(r=>r())
    lastSynchronousScopePatched = null

    while (authed && lastSentSI+1 < messageQueue.length) {
      lastSynchronousScopePatched = null
      try {
        connection.send(messageQueue[lastSentSI + 1])
        lastSentSI += 1
        //  async so we don't try and push more to a closed connection
        await new Promise(r=>r())
      }
      catch (error) {
        console.warn('ERROR SENDING OVER CONNECTION', error)
        restartConnection()
        break
      }
    }
  }

  function resolveSyncPromises() {
    const lowestOutstandingResponseIndex = Object.keys(responses).map(parseInt).sort()[0] || Infinity
    while (outstandingSyncPromises[0] && outstandingSyncPromises[0].si < lowestOutstandingResponseIndex) {
      outstandingSyncPromises.shift().resolve()
    }
  }

  function nudgeOutstandingResponse() {
    if (Object.keys(responses).length === 0) return

    // Avoid the TCP delayed-ACK/Nagle gap after same-connection subscription echoes.
    connection.send({ ack: NOOP_ACK })
  }

  function checkHeartbeat() {
    clearTimeout(lastHeartbeat)
    lastHeartbeat = setTimeout(
      () => {
        log('CLOSING DUE TO HEARTBEAT TIMEOUT')
        restartConnection()
      },
      HEARTBEAT_TIMEOUT
    )
  }

  async function restartConnection() {
    if (restarting) return

    clearTimeout(lastHeartbeat)
    authed = false
    connection.onmessage = () => {} // needs to be a no-op since a closing connection can still get messages
    if (disconnected) return

    restarting = true
    try {
      await new Promise(r => setTimeout(r, Math.min(1000, failedConnections * 100)))
      if (disconnected) return
      failedConnections += 1
      initConnection() // TODO: don't do this if we are purposefully unloading...
    }
    finally {
      restarting = false
    }
  }

  function initConnection() {
    connection = new Connection()

    connection.onopen = async () => {
      if (!sessionMetrics.connected) sessionMetrics.connected = Date.now()
      log('AUTHORIZING NEWLY OPENED CONNECTION FOR SESSION:', session)
      failedConnections = 0
      const currentSID = await sid?.()
      if (!session && sessionSID === undefined) sessionSID = currentSID
      const authMessage = { sid: sessionSID ?? currentSID, session, domain }
      if (!session) authMessage.token = await token()
      connection.send(authMessage)
    }

    connection.onmessage = async message => {
      checkHeartbeat()
      if (!message) return // heartbeat

      try {
        if (!authed) {
          //  TODO: credential refresh flow instead of forcing login
          if (message.error) alert('Authentication Error. Please try again.')

          authed = true
          if (!user) { // this is the first authed websocket connection
            console.log('INIT MESSAGE', message)
            sessionMetrics.authenticated = Date.now()
            user = message.auth.user
            session = message.session
            server = message.server

            //  TODO: save session metrics on session

            resolveEnvironment(message)
          }
          else if (server !== message.server) {
            console.warn(`REBOOTING DUE TO SERVER SWITCH ${server} -> ${message.server}`, message)
            reboot()
          }
          else if (session !== message.session) {
            console.warn(`REBOOTING DUE TO SESSION SWITCH ${session} -> ${message.session}`, message)
            reboot()
          }
          else {
            const ack = message.ack ?? -1
            lastConfirmedSI = Math.max(lastConfirmedSI, ack)
            lastSentSI = ack
          }
          flushMessageQueue()
        }
        else {
          if (DOMAIN_MESSAGES[message.type]) {
            try {
              handleDomainMessage && handleDomainMessage(message, trigger)
            }
            catch (error) {
              log('ERROR HANDLING DOMAIN MESSAGE', message)
            }
          }
          else if (message.si !== undefined) {
            if (responses[message.si]) {
              if (message.error) console.warn('ERROR RESPONSE', message)

              //  TODO: remove "acknowledged" messages from queue and do accounting with si
              responses[message.si]
                .forEach(([res, rej]) => message.error ? rej(message) : res(message))

              delete responses[message.si]
              lastConfirmedSI = Math.max(lastConfirmedSI, message.si)
              connection.send({ack: message.si}) //  acknowledgement that we have received the response for this message
              resolveSyncPromises()
            }
            else {
              if (message.si > lastConfirmedSI) {
                if (message.error) console.warn('ERROR RESPONSE', message)
                console.warn('received response with no pending message for si', message.si, message)
              }
              lastConfirmedSI = Math.max(lastConfirmedSI, message.si)
              connection.send({ack: message.si})
            }
          }
          else {
            nudgeOutstandingResponse()

            const d = message.domain === domain ? '' : message.domain
            const u = message.user === user ? '' : message.user
            const s = message.scope
            const qualifiedScope = isUUID(s) ? s : `${d}/${u}/${s}`
            if (watchers[qualifiedScope]) {
              states[qualifiedScope] = await states[qualifiedScope]

              if (states[qualifiedScope].ii + 1 !== message.ii) {
                //console.warn('OUT OF ORDER WATCHER RECEIVED', qualifiedScope, states[qualifiedScope], message)
                return
              }

              //  TODO: this should come down with patch...
              states[qualifiedScope].ii = message.ii

              const lastResetPatchIndex = message.patch.findLastIndex(p => p.path.length === 0)
              if (lastResetPatchIndex > -1) states[qualifiedScope] = message.patch[lastResetPatchIndex].value

              if (states[qualifiedScope].active === undefined) states[qualifiedScope].active = {}
              applyPatch(states[qualifiedScope], standardJSONPatch(message.patch.slice(lastResetPatchIndex + 1)))
              watchers[qualifiedScope]
                .forEach(fn => {
                  const state = structuredClone(states[qualifiedScope].active)
                  fn({ ...message, patch: activePatch(message.patch), state })
                })
            }
          }
        }
      }
      catch (error) {
        console.error('ERROR HANDLING CONNECTION MESSAGE', error, message)
      }
    }

    connection.onerror = async error => {
      log('CONNECTION ERROR', error.message)
    }

    connection.onclose = async error => {
      log('CONNECTION CLOSURE', error?.message ?? error)
      restartConnection()
    }

    checkHeartbeat()
  }

  async function synced() {
    const syncPromise = new Promise(resolve => outstandingSyncPromises.push({ si, resolve }))
    resolveSyncPromises()
    return syncPromise
  }

  function lastMessageResponse() {
    if (!responses[si]) throw new Error('A response must be requested before all outstanding responses have already returned')

    return new Promise((res, rej) => responses[si].push([res, rej]))
  }

  function disconnect() {
    log('DISCONNECTED AGENT!!!!!!!!!!!!!!!')
    disconnected = true
    clearTimeout(lastHeartbeat)
    authed = false
    connection.onmessage = () => {}
    connection.close({ keepalive: true })
  }

  function reconnect() {
    log('RECONNECTED AGENT!!!!!!!!!!!!!!!')
    const wasDisconnected = disconnected
    disconnected = false
    if (!wasDisconnected && authed) {
      clearTimeout(lastHeartbeat)
      authed = false
      connection.onmessage = () => {}
      connection.onclose = () => {}
      connection.close({ keepalive: true })
    }
    return restartConnection()
  }

  initConnection()

  return [queueMessage, lastMessageResponse, disconnect, reconnect, synced, environment]
}
