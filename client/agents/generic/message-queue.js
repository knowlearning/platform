import { validate as isUUID } from 'uuid'

const HEARTBEAT_TIMEOUT = 10000

//  transform our custom path implementation to the standard JSONPatch path
function standardJSONPatch(patch) {
  return patch.map(p => {
    return {...p, path: '/' + p.path.map(sanitizeJSONPatchPathSegment).join('/')}
  })
}

function sanitizeJSONPatchPathSegment(s) {
  if (typeof s === "string") return s.replaceAll('~', '~0').replaceAll('/', '~1')
  else return s
}

export default function messageQueue({ token, protocol, host, WebSocket, watchers, states, applyPatch, log, login, interact }) {
  let ws
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
  const outstandingSyncPromises = []
  const responses = {}


  let resolveEnvironment
  const environmentPromise = new Promise(r => resolveEnvironment = r)

  const sessionMetrics = {
    loaded: Date.now(),
    connected: null,
    authenticated: null
  }

  async function environment() { return { ...(await environmentPromise), context: [] } }

  function queueMessage({ scope, patch }) {
    if (lastSynchronousScopePatched === scope) {
      const i = messageQueue.length - 1
      messageQueue[i].patch = [...messageQueue[i].patch, ...patch]
    }
    else {
      si += 1
      lastSynchronousScopePatchPromise = new Promise((resolve, reject) => responses[si] = [[resolve, reject]])
      messageQueue.push({ scope, patch, si, ts: Date.now()})
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

    while (authed && ws.readyState === WebSocket.OPEN && lastSentSI+1 < messageQueue.length) {
      lastSynchronousScopePatched = null
      lastSentSI += 1
      ws.send(JSON.stringify(messageQueue[lastSentSI]))

      //  async so we don't try and push more to a closed connection
      await new Promise(r=>r())
    }
  }

  function resolveSyncPromises() {
    const lowestOutstandingResponseIndex = Object.keys(responses).map(parseInt).sort()[0] || Infinity
    while (outstandingSyncPromises[0] && outstandingSyncPromises[0].si < lowestOutstandingResponseIndex) {
      outstandingSyncPromises.shift().resolve()
    }
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

    authed = false
    if (!disconnected) {
      await new Promise(r => setTimeout(r, Math.min(1000, failedConnections * 100)))
      ws.onmessage = () => {} // needs to be a no-op since a closing ws can still get messages
      restarting = true
      failedConnections += 1
      initWS() // TODO: don't do this if we are purposefully unloading...
      restarting = false
    }
  }

  function initWS() {
    ws = new WebSocket(`${protocol}://${host}`)

    ws.onopen = async () => {
      if (!sessionMetrics.connected) sessionMetrics.connected = Date.now()
      log('AUTHORIZING NEWLY OPENED WS FOR SESSION:', session)
      failedConnections = 0
      ws.send(JSON.stringify({ token: await token(), session }))
    }

    ws.onmessage = async ({ data }) => {
      checkHeartbeat()
      if (data.length === 0) return // heartbeat

      try {
        log('handling message', disconnected, authed)
        const message = JSON.parse(data)
        log('message', JSON.stringify(message))

        if (message.error) console.warn('ERROR RESPONSE', message)

        if (!authed) {
          //  TODO: credential refresh flow instead of forcing login
          if (message.error) return login()

          authed = true
          if (!user) { // this is the first authed websocket connection
            sessionMetrics.authenticated = Date.now()
            user = message.auth.user
            session = message.session
            server = message.server

            // save session metrics
            interact(session, [
              {op: 'add', path: ['active', 'loaded'], value: sessionMetrics.loaded },
              {op: 'add', path: ['active', 'connected'], value: sessionMetrics.connected },
              {op: 'add', path: ['active', 'authenticated'], value: sessionMetrics.authenticated },
            ])

            resolveEnvironment(message)
          }
          else if (server !== message.server) {
            console.warn(`REBOOTING DUE TO SERVER SWITCH ${server} -> ${message.server}`)
            reboot()
          }
          else {
            lastSentSI = message.ack
          }
          flushMessageQueue()
        }
        else {
          if (message.si !== undefined) {
            if (responses[message.si]) {
              //  TODO: remove "acknowledged" messages from queue and do accounting with si
              responses[message.si]
                .forEach(([res, rej]) => message.error ? rej(message) : res(message))

              delete responses[message.si]
              ws.send(JSON.stringify({ack: message.si})) //  acknowledgement that we have received the response for this message
              resolveSyncPromises()
            }
            else {
              //  TODO: consider what to do here... probably want to throw error if in dev env
              console.warn('received MULTIPLE responses for message with si', message.si, message)
            }
          }
          else {
            const d = message.domain === window.location.host ? '' : message.domain
            const u = message.user === user ? '' : message.user
            const s = message.scope
            const qualifiedScope = isUUID(s) ? s : `${d}/${u}/${s}`
            if (watchers[qualifiedScope]) {
              states[qualifiedScope] = await states[qualifiedScope]

              const lastResetPatchIndex = message.patch.findLastIndex(p => p.path.length === 0)
              if (lastResetPatchIndex > -1) states[qualifiedScope] = message.patch[lastResetPatchIndex].value

              if (states[qualifiedScope].active === undefined) states[qualifiedScope].active = {}
              applyPatch(states[qualifiedScope], standardJSONPatch(message.patch.slice(lastResetPatchIndex + 1)))
              watchers[qualifiedScope]
                .forEach(fn => {
                  const state = structuredClone(states[qualifiedScope].active)
                  fn({ ...message, state })
                })
            }
          }
        }
      }
      catch (error) {
        console.error('ERROR HANDLING WS MESSAGE', error)
      }
    }

    ws.onerror = async error => {
      log('WS CONNECTION ERROR', error.message)
    }

    ws.onclose = async error => {
      log('WS CLOSURE', error.message)
      restartConnection()
    }

    checkHeartbeat()
  }

  async function synced() {
    const syncPromise = new Promise(resolve => outstandingSyncPromises.push({ si: lastSentSI, resolve }))
    resolveSyncPromises()
    return syncPromise
  }

  function lastMessageResponse() { return new Promise((res, rej) => responses[si].push([res, rej])) }

  function disconnect() {
    log('DISCONNECTED AGENT!!!!!!!!!!!!!!!')
    disconnected = true
    ws.close()
  }

  function reconnect() {
    log('RECONNECTED AGENT!!!!!!!!!!!!!!!')
    disconnected = false
    restartConnection()
  }

  initWS()

  return [queueMessage, lastMessageResponse, disconnect, reconnect, synced, environment]
}