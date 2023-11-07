import MutableProxy from '../../persistence/json.js'
import initializeMessageQueue from './initialize-message-queue.js'
import stateImplementation from './state.js'
import downloadImplementation from '../download.js'

// TODO: consider using something better than name as mechanism
//       for resoling default scope in context
const DEFAULT_SCOPE_NAME = '[]'
const SESSION_TYPE = 'application/json;type=session'
const UPLOAD_TYPE = 'application/json;type=upload'
const POSTGRES_QUERY_TYPE = 'application/json;type=postgres-query'
const TAG_TYPE = 'application/json;type=tag'
const DOMAIN_CLAIM_TYPE = 'application/json;type=domain-claim'

function isUUID(string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-5][0-9a-f]{3}-[089ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(string)
}

export default function Agent({ host, token, WebSocket, protocol='ws', uuid, fetch, applyPatch, login, logout, reboot }) {
  const states = {}
  const watchers = {}
  const keyToSubscriptionId = {}
  const lastInteractionResponse = {}
  const tagTypeToTargetCache = {}
  let resolveEnvironment
  let mode = 'normal'
  const environmentPromise = new Promise(r => resolveEnvironment = r)

  log('INITIALIZING AGENT CONNECTION')
  const messageQueueReferences = { token, protocol, host, WebSocket, watchers, states, applyPatch, log, login, interact }
  const [
    queueMessage,
    lastMessageResponse,
    disconnect,
    reconnect,
    synced
  ] = initializeMessageQueue(resolveEnvironment, messageQueueReferences)

  const internalReferences = {
    keyToSubscriptionId,
    watchers,
    states,
    create,
    environment,
    lastInteractionResponse,
    lastMessageResponse,
    tagIfNotYetTaggedInSession,
    interact,
    fetch,
    metadata,
  }

  function state(scope) { return stateImplementation(scope, internalReferences) }

  function download(id) { return downloadImplementation(id, internalReferences) }

  function log() { if (mode === 'debug') console.log(...arguments) }

  function removeWatcher(key, fn) {
    const watcherIndex = watchers[key].findIndex(x => x === fn)
    if (watcherIndex > -1) watchers[key].splice(watcherIndex, 1)
    else console.warn('TRIED TO REMOVE WATCHER THAT DOES NOT EXIST')
  }
  function create({ id=uuid(), active_type, active, name }) {
    //  TODO: collapse into 1 patch and 1 interact call
    //        (requires updating side effects)
    const patch = [
      { op: 'add', path: ['active_type'], value: active_type },
      { op: 'add', path: ['active'], value: active }
    ]
    interact(id, patch, false)
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

  function watchResolution(path, callback) {
    const id = path[0]
    const references = path.slice(1)
    let unwatchDeeper = () => {}

    const unwatch = watch(id, ({ state }) => {
      if (references.length === 0) {
        callback(state)
        return
      }

      //  TODO: check if value we care about actually changed
      //        and ignore this update if it has not.
      unwatchDeeper()

      let value = state
      for (let index = 0; index < references.length; index += 1) {
        value = value[references[index]]
        if (
          value === null ||
          value === undefined ||
          index === references.length - 1
        ) callback(value)
        else if (isUUID(value)) {
          unwatchDeeper = watchResolution([value, ...references.slice(index + 1)], callback)
          return
        }
      }
    })

    return () => {
      unwatch()
      unwatchDeeper()
    }
  }

  async function environment() {
    return { ...(await environmentPromise), context: [] }
  }

  function watch(scope=DEFAULT_SCOPE_NAME, fn) {
    if (Array.isArray(scope)) return watchResolution(scope, fn)

    let initialSent = false
    const queue = []
    function cb(update) {
      if (initialSent) fn(update)
      else queue.push(update)
    }

    const statePromise = state(scope)
    if (!watchers[scope]) watchers[scope] = []
    watchers[scope].push(cb)

    metadata(scope)
      .then(async ({ ii }) => {
        fn({
          scope,
          state: await statePromise,
          patch: null,
          ii
        })
        initialSent = true
        queue.forEach(fn)
      })

    return () => removeWatcher(scope, cb)
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

  //  TODO: addTag option should probably not be exposed
  async function interact(scope=DEFAULT_SCOPE_NAME, patch, addTag=true) {
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
    const id = uuid()
    create({
      id,
      active_type: DOMAIN_CLAIM_TYPE,
      active: { domain }
    })
    return lastMessageResponse()
  }

  function reset(scope=DEFAULT_SCOPE_NAME) {
    return interact(scope, [{ op: 'remove', path:['active'] }])
  }

  function isValidMetadataMutation({ path, op, value }) {
    return (
      ['active_type', 'name'].includes(path[0])
      && path.length === 1
      && typeof value === 'string' || op === 'remove'
    )
  }

  async function metadata(id=DEFAULT_SCOPE_NAME) {
    // TODO: handle when id is undefined (default like state call?)
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

  function debug() {
    mode = 'debug'
  }

  async function query(query, params, domain) {
    const id = uuid()
    create({
      id,
      active_type: POSTGRES_QUERY_TYPE,
      active: { query, params, domain, requested: Date.now() },
    })
    const { rows } = await lastMessageResponse()
    interact(id, [{ op: 'add', path: ['active', 'responded'], value: Date.now() }])
    return rows
  }

  function tag(tag_type, target, context=[]) {
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
    download,
    interact,
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