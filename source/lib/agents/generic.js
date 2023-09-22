import MutableProxy from '../persistence/json.js'
import download from './download.js'

const HEARTBEAT_TIMEOUT = 10000
const UPLOAD_TYPE = 'application/json;type=upload'
const SUBSCRIPTION_TYPE = 'application/json;type=subscription'
const POSTGRES_QUERY_TYPE = 'application/json;type=postgres-query'
const TAG_TYPE = 'application/json;type=tag'

//  transform our custom path implementation to the standard JSONPatch path
function standardJSONPatch(patch) {
  return patch.map(p => {
    return {...p, path: '/' + p.path.map(sanitizeJSONPatchPathSegment).join('/')}
  })
}

function isUUID(string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(string)
}

function sanitizeJSONPatchPathSegment(s) {
  if (typeof s === "string") return s.replaceAll('~', '~0').replaceAll('/', '~1')
  else return s
}

export default function Agent({ host, token, WebSocket, protocol='ws', uuid, fetch, applyPatch, login, logout, reboot }) {
  let ws
  let user
  let domain
  let session
  let server
  let isSynced = false
  let si = -1
  let authed = false
  const states = {}
  const responses = {}
  const watchers = {}
  const keyToSubscriptionId = {}
  const lastInteractionResponse = {}
  const tagTypeToTargetCache = {}
  const messageQueue = []
  let resolveEnvironment
  let disconnected = false
  let failedConnections = 0
  let mode = 'normal'
  const environmentPromise = new Promise(r => resolveEnvironment = r)
  let lastSentSI = -1
  let lastHeartbeat
  const syncedPromiseResolutions = []

  const patches = state('patches')

  log('INITIALIZING AGENT CONNECTION')
  initWS()

  function log() {
    if (mode === 'debug') console.log(...arguments)
  }

  function resolveSyncPromises() {
    while (syncedPromiseResolutions.length) syncedPromiseResolutions.shift()()
    isSynced = true
  }

  function removeWatcher(key, fn) {
    const watcherIndex = watchers[key].findIndex(x => x === fn)
    if (watcherIndex > -1) watchers[key].splice(watcherIndex, 1)
    else console.warn('TRIED TO REMOVE WATCHER THAT DOES NOT EXIST')
  }
  function flushMessageQueue() {
    //  TODO: probably want to make this loop async so we don't try and push more to
    //        a closed connection
    while (authed && ws.readyState === WebSocket.OPEN && lastSentSI+1 < messageQueue.length) {
      lastSentSI += 1
      ws.send(JSON.stringify(messageQueue[lastSentSI]))
    }
  }

  function lastMessageResponse() { //  TODO: handle error responses
    return new Promise((resolve, reject) => responses[si].push([resolve, reject]))
  }

  function queueMessage(message) {
    isSynced = false
    si += 1
    const promise = new Promise((resolve, reject) => responses[si] = [[resolve, reject]])
    messageQueue.push({...message, si, ts: Date.now()})
    flushMessageQueue()
    return promise
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

  let restarting = false
  async function restartConnection() {
    if (restarting) return

    restarting = true
    authed = false
    ws.onmessage = () => {} // needs to be a no-op since a closing ws can still get messages
    if (!disconnected) {
      await new Promise(r => setTimeout(r, Math.min(1000, failedConnections * 100)))
      failedConnections += 1
      initWS() // TODO: don't do this if we are purposefully unloading...
      restarting = false
    }
  }

  function initWS() {
    ws = new WebSocket(`${protocol}://${host}`)

    ws.onopen = async () => {
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
        if (mode === 'debug') log('message', JSON.stringify(message))

        if (message.error) console.warn('ERROR RESPONSE', message)

        if (!authed) {
          //  TODO: credential refresh flow instead of forcing login
          if (message.error) return login()

          authed = true
          if (!user) { // this is the first authed websocket connection
            user = message.auth.user
            session = message.session
            domain = message.domain
            server = message.server
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
                .forEach(([resolve, reject]) => {
                  message.error ? reject(message) : resolve(message)
                })
              delete responses[message.si]
              ws.send(JSON.stringify({ack: message.si})) //  acknowledgement that we have received the response for this message
              if (Object.keys(responses).length === 0) {
                resolveSyncPromises()
              }
            }
            else {
              //  TODO: consider what to do here... probably want to throw error if in dev env
              console.warn('received MULTIPLE responses for message with si', message.si, message)
            }
          }
          else {
            if (watchers[message.scope]) {
              states[message.scope] = await states[message.scope]

              const lastResetPatchIndex = message.patch.findLastIndex(p => p.path.length === 0)
              if (lastResetPatchIndex > -1) states[message.scope] = message.patch[lastResetPatchIndex].value

              if (states[message.scope].active === undefined) states[message.scope].active = {}
              applyPatch(states[message.scope], standardJSONPatch(message.patch.slice(lastResetPatchIndex + 1)))
              watchers[message.scope]
                .forEach(fn => {
                  const state = structuredClone(states[message.scope].active)
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

  function create({ id=uuid(), active_type, active, name }) {
    //  TODO: collapse into 1 patch and 1 interact call
    interact(id, [{ op: 'add', path: ['active_type'], value: active_type }], false)
    interact(id, [{ op: 'add', path: ['active'], value: active }], false)
    return id
  }

  async function tagIfNotYetTaggedInSession(tag_type, target) {
    const targetCache = tagTypeToTargetCache[tag_type]
    if (targetCache && targetCache[target]) return

    if (!targetCache) tagTypeToTargetCache[tag_type] = {}
    if (tagTypeToTargetCache[tag_type][target]) return

    tagTypeToTargetCache[tag_type][target] = true

      //  always use absolute referene when tagging
    if (!isUUID(target)) target = (await metadata(target)).id

    await tag(tag_type, target)
  }

  async function environment() {
    return { ...(await environmentPromise), context: [] }
  }

  function state(scope='[]') {
    tagIfNotYetTaggedInSession('subscribed', scope)
    return new Promise(async (resolveState, rejectState) => {
      if (!keyToSubscriptionId[scope]) {
        const id = uuid()

        keyToSubscriptionId[scope] = id
        watchers[scope] = []
        states[scope] = new Promise(async (resolve, reject) => {
          create({
            id,
            active_type: SUBSCRIPTION_TYPE,
            active: { session, scope, ii: null }
          })

          try {
            const state = await lastMessageResponse()
            //  TODO: replace with editing scope of type
            interact(id, [{
              op: 'add',
              path: ['active', 'ii'],
              value: 1 // TODO: use state.ii when is coming down properly...
            }])

            resolve(state)

            if (state.ii === -1) {
              // -1 indicates the result is a computed scope, so
              // ii does not apply (we clear out the subscription to not cache value)
              delete states[scope]
              delete keyToSubscriptionId[scope]
            }
          }
          catch (error) {
            reject(error)
          }
        })
      }

      await lastInteractionResponse[scope]

      try {
        const state = structuredClone(await states[scope])

        resolveState(new MutableProxy(state.active || {}, patch => {
          const activePatch = structuredClone(patch)
          activePatch.forEach(entry => entry.path.unshift('active'))
          interact(scope, activePatch)
        }))
      }
      catch (error) {
        rejectState(error)
      }
    })
  }

  function watch(id, fn) {
    let initialSent = false
    const queue = []
    function cb(update) {
      if (initialSent) fn(update)
      else queue.push(update)
    }

    const statePromise = state(id)
    if (!watchers[id]) watchers[id] = []
    watchers[id].push(cb)

    metadata(id)
      .then(async ({ ii }) => {
        fn({
          scope: id,
          state: await statePromise,
          patch: null,
          ii
        })
        initialSent = true
        queue.forEach(fn)
      })

    return () => removeWatcher(id, cb)
  }

  //  TODO: if no data, set up streaming upload
  async function upload(name, type, data, id=uuid()) {
    //  TODO: include data size info...
    create({
      active_type: UPLOAD_TYPE,
      active: { id, type }
    })
    const { url } = await lastMessageResponse()

    if (data === undefined) return url
    else {
      const headers = { 'Content-Type': type }
      const response = await fetch(url, {method: 'PUT', headers, body: data})
      const { ok, statusText } = response

      if (ok) return id
      else throw new Error(statusText)
    }
  }

  async function patch(root, scopes) {
    patches[uuid()] = { root, scopes }
    const { swaps } = await lastMessageResponse()
    return { swaps }
  }

  //  TODO: addTag option should probably not be exposed
  async function interact(scope, patch, addTag=true) {
    if (addTag) tagIfNotYetTaggedInSession('mutated', scope)
    //  TODO: ensure user is owner of scope
    const response = queueMessage({scope, patch})

    //  if we are watching this scope, we want to keep track of last interaction we fired
    if (states[scope] !== undefined) {
      let resolve
      lastInteractionResponse[scope] = new Promise(r => resolve = r)

      const resolveAndUnwatch = async (update) => {
        const { ii } = await response
        if (update.ii === ii) {
          resolve(ii)
          removeWatcher(scope, resolveAndUnwatch)
        }
      }

      watchers[scope].push(resolveAndUnwatch)

      return response
    }
    else {
      const { ii } = await response
      return { ii }
    }
  }

  async function claim(domain) {
    return interact('claims', [{ op: 'add', path: ['active', domain], value: null }])
  }

  function reset(scope) {
    return interact(scope, [{ op: 'remove', path:['active'] }])
  }

  function isValidMetadataMutation({ path, op, value }) {
    return (
      ['active_type', 'name'].includes(path[0])
      && path.length === 1
      && typeof value === 'string' || op === 'remove'
    )
  }

  async function metadata(id) {
    await state(id)
    const md = structuredClone(await states[id])
    delete md.active
    return new MutableProxy(md, patch => {
      const activePatch = structuredClone(patch)
      activePatch.forEach(entry => {
        if (!isValidMetadataMutation(entry)) throw new Error('You may only modify the type or name for a scope\'s metadata')
      })
      interact(id, activePatch)
    })
  }

  async function synced() {
    return isSynced ? null : new Promise(resolve => syncedPromiseResolutions.push(resolve))
  }

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

  function debug() {
    mode = 'debug'
  }

  async function query(query, params, domain) {
    create({
      active_type: POSTGRES_QUERY_TYPE,
      active: { query, params, domain }
    })
    const { rows } = await lastMessageResponse()
    return rows
  }

  function tag(tag_type, target, context=[]) {
    console.log('TAGGING', tag_type, target, context)
    return create({
      active_type: TAG_TYPE,
      active: { tag_type, target, context }
    })
  }

  return {
    uuid,
    environment,
    login,
    logout,
    create,
    state,
    watch,
    upload,
    download: id => download(id, { create, lastMessageResponse, fetch, metadata }),
    interact,
    patch,
    claim,
    reset,
    metadata,
    query,
    synced,
    disconnect,
    reconnect,
    tag,
    debug
  }
}