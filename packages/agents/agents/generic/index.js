import { validate as isUUID } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'
import messageQueue from './message-queue.js'
import stateImplementation from './state.js'
import watchImplementation from '../watch.js'
import downloadImplementation from '../download.js'
import sync from '../sync.js'

// TODO: consider using something better than name as mechanism
//       for resoling default scope in context
const DEFAULT_SCOPE_NAME = '[]'
const UPLOAD_TYPE = 'application/json;type=upload'
const DOMAIN_CLAIM_TYPE = 'application/json;type=domain-claim'

export default function Agent({ Connection, domain, token, sid, uuid, fetch, applyPatch, login, logout, reboot, handleDomainMessage, log:passedLog=console.log, variables={} }) {
  const states = {}
  const watchers = {}
  const keyToSubscriptionId = {}
  const lastInteractionResponse = {}

  log('INITIALIZING AGENT CONNECTION')
  const [
    queueMessage,
    lastMessageResponse,
    disconnect,
    reconnect,
    synced,
    environment
  ] = messageQueue({ token, sid, domain, Connection, watchers, states, applyPatch, log, login, interact, reboot, trigger, handleDomainMessage, variables })

  // initialize session
  const initialSessionData = { queries: {}, subscriptions: {}, guarantees: {} }
  environment()
    .then(({ session }) => {
      interact('sessions', [{ op: 'add', path: ['active', session], value: initialSessionData }], false)
    })

  const internalReferences = {
    keyToSubscriptionId,
    watchers,
    states,
    state,
    create,
    environment,
    lastInteractionResponse,
    lastMessageResponse,
    interact,
    fetch,
    synced,
    metadata,
    log
  }

  const [ watch, removeWatcher ] = watchImplementation(internalReferences)

  function state(scope, user, domain) { return stateImplementation(scope, user, domain, internalReferences) }

  function download(id) { return downloadImplementation(id, internalReferences) }

  //  TODO: deprecate
  function debug() {}

  function log() { passedLog(...arguments) }

  function create({ id=uuid(), active_type, active, name }) {
    if (!active_type) active_type = 'application/json'
    const patch = [
      { op: 'add', path: ['active_type'], value: active_type },
      { op: 'add', path: ['active'], value: active }
    ]
    if (name) patch.push({ op: 'add', path: ['name'], value: name })

    interact(id, patch)
    return id
  }

  async function upload(info) {
    const { name, type, data, id=uuid() } = info || {}
    create({
      active_type: UPLOAD_TYPE,
      active: { id, type, name },
      name
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

  async function interact(scope=DEFAULT_SCOPE_NAME, patch, manageLocalState=true, context=[]) {
    //  TODO: ensure user is owner of scope
    const response = queueMessage({scope, patch, context})

    //  if we are watching this scope, we want to keep track of last interaction we fired
    const qualifiedScope = isUUID(scope) ? scope : `//${scope}`
    if (manageLocalState && states[qualifiedScope] !== undefined) {
      lastInteractionResponse[qualifiedScope] = response.then(r => r.ii)
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

  async function metadata(id=DEFAULT_SCOPE_NAME, user, domain) {
    const md = structuredClone(await state(id, user, domain).metadata)
    delete md.active
    return new PatchProxy(md, patch => {
      const activePatch = structuredClone(patch)
      if (!activePatch.every(isValidMetadataMutation)) {
        throw new Error("You may only modify the type or name for a scope's metadata")
      }
      //  TODO: if user is not active user, reject the metadata update with error
      interact(id, activePatch)
    })
  }

  async function query(query, params, domain, context=[]) {
    const id = uuid()
    const requested = Date.now()
    const { session } = await environment()
    await new Promise(r => setTimeout(r)) //  ensure next interaction gets sent on its own
    interact('sessions', [
      {
        op: 'add',
        path: ['active', session, 'queries', id],
        value: { query, params, domain, context }
      }
    ], false)
    try {
      const response = await lastMessageResponse()
      return response.rows
    }
    catch (error) {
      throw error.error
    }
  }

  const reactions = { child: [] }

  function on(event, reaction) {
    if (!reactions[event]) throw new Error('Agent can only listen to events of "child"')
    reactions[event].push(reaction)
  }

  function trigger(event, data) {
    reactions[event].forEach(f => f(data))
  }

  async function guarantee(script, namespaces=[], context=[]) {
    const { session } = await environment()
    const id = uuid()

    interact('sessions', [
      {
        op: 'add',
        path: ['active', session, 'guarantees', id],
        value: { script, namespaces, context }
      }
    ], false)

    return {
      execute() {
        //  TODO: use simplified worker wrapper to execute script in restricted environment
      },
      cancel() {
        interact('sessions', [
          {
            op: 'remove',
            path: ['active', session, 'guarantees', id]
          }
        ], false)
      }
    }
  }

  function response() {
    return lastMessageResponse()
  }

  return {
    uuid,
    environment,
    login,
    logout,
    log,
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
    debug,
    guarantee,
    response,
    sync,
    on
  }
}