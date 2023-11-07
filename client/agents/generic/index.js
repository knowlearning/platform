import { validate as isUUID } from 'uuid'
import MutableProxy from '../../persistence/json.js'
import messageQueue from './message-queue.js'
import stateImplementation from './state.js'
import watchImplementation from './watch.js'
import downloadImplementation from '../download.js'

// TODO: consider using something better than name as mechanism
//       for resoling default scope in context
const DEFAULT_SCOPE_NAME = '[]'
const UPLOAD_TYPE = 'application/json;type=upload'
const POSTGRES_QUERY_TYPE = 'application/json;type=postgres-query'
const TAG_TYPE = 'application/json;type=tag'
const DOMAIN_CLAIM_TYPE = 'application/json;type=domain-claim'

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
  const [
    queueMessage,
    lastMessageResponse,
    disconnect,
    reconnect,
    synced
  ] = messageQueue(resolveEnvironment, { token, protocol, host, WebSocket, watchers, states, applyPatch, log, login, interact })

  const internalReferences = {
    keyToSubscriptionId,
    watchers,
    states,
    state,
    create,
    environment,
    lastInteractionResponse,
    lastMessageResponse,
    tagIfNotYetTaggedInSession,
    interact,
    fetch,
    metadata
  }

  const [ watch, removeWatcher ] = watchImplementation(internalReferences)

  async function environment() { return { ...(await environmentPromise), context: [] } }

  function state(scope, user) { return stateImplementation(scope, user, internalReferences) }

  function download(id) { return downloadImplementation(id, internalReferences) }

  function debug() { mode = 'debug' }

  function log() { if (mode === 'debug') console.log(...arguments) }

  function create({ id=uuid(), active_type, active, name }) {
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

  async function metadata(id=DEFAULT_SCOPE_NAME, user) {
    await state(id, user)
    const md = structuredClone(await states[id])
    delete md.active
    return new MutableProxy(md, patch => {
      const activePatch = structuredClone(patch)
      if (!activePatch.every(isValidMetadataMutation)) {
        throw new Error("You may only modify the type or name for a scope's metadata")
      }
      interact(id, activePatch)
    })
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