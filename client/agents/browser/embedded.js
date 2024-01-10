import { validate as isUUID, v1 as uuid } from 'uuid'
import watchImplementation from '../watch.js'
import MutableProxy from '../../persistence/json.js'

export default function EmbeddedAgent() {
  let messageIndex = 0
  let resolveSession
  const session = new Promise(r => resolveSession = r)
  const responses = {}
  const watchers = {}
  const sentUpdates = {}

  const [ watch, removeWatcher ] = watchImplementation({ metadata, state, watchers, synced, sentUpdates, environment })

  async function send(message) {
    const requestId = message.requestId || uuid()

    messageIndex += 1
    //  default to window opener if present
    const upstream = window.opener ? window.opener : window.parent
    try {
      upstream
        .postMessage({
          ...message,
          session: await session,
          requestId,
          index: messageIndex
        }, '*')
      return new Promise((resolve, reject) => {
        responses[requestId] = { resolve, reject }
      })
    }
    catch (error) {
      console.log('ERROR POSTING MESSAGE UP', message, error)
    }
  }

  let sessionResolved = false
  addEventListener('message', async ({ data }) => {
    if (data.type === 'setup' && !sessionResolved) {
      sessionResolved = true
      resolveSession(data.session)
    }
    else if (!sessionResolved || data.session !== await session) return
    else if (responses[data.requestId]) {
      const { resolve, reject } = responses[data.requestId]
      if (data.error) reject(data.error)
      else resolve(data.response)
    }
    else if (data.ii !== undefined) {
      const { scope, user, domain } = data
      const { auth, domain:rootDomain } = await environment()
      const d = !domain || domain === rootDomain ? '' : domain
      const u = !user || auth.user === user ? '' : user
      const key = isUUID(scope) ? scope : `${d}/${u}/${scope}`

      const sendUpdate = () => {
        sentUpdates[key] = data.ii
        watchers[key].forEach(fn => fn(data))
      }

      if (watchers[key]) {
        if (sentUpdates[key] === undefined || sentUpdates[key] + 1 === data.ii) sendUpdate()
        else if (data.ii === sentUpdates[key]) console.warn('Repeated update for', key, data, sentUpdates[key])
        else {
          console.warn('Out of order update for', key, data, sentUpdates[key])
          if (data.ii > sentUpdates[key]) sendUpdate()
        }
      }
    }
  })

  function environment(user) {
    return send({ type: 'environment', user })
  }

  function create({ id=uuid(), active_type, active }) {
    if (!active_type) active_type = 'application/json'
    interact(id, [
      { op: 'add', path: ['active_type'], value: active_type },
      { op: 'add', path: ['active'], value: active }
    ])
    return id
  }

  const tagTypeToTargetCache = {}
  async function tagIfNotYetTaggedInSession(tag_type, target) {
    const targetCache = tagTypeToTargetCache[tag_type]
    if (targetCache && targetCache[target]) return

    //  always use absolute referene when tagging
    if (!isUUID(target)) target = (await metadata(target)).id

    if (!tagTypeToTargetCache[tag_type]) tagTypeToTargetCache[tag_type] = {}
    if (tagTypeToTargetCache[tag_type][target]) return

    tagTypeToTargetCache[tag_type][target] = true
    await tag(tag_type, target)
  }

  async function patch(root, scopes) {
    //  TODO: consider watch function added to return to receive progress
    return send({ type: 'patch', root, scopes })
  }

  async function state(scope, user, domain) {
    if (scope === undefined) {
      const { context } = await environment()
      scope = JSON.stringify(context)
    }
    tagIfNotYetTaggedInSession('subscribed', scope)
    const startState = await send({ type: 'state', scope, user, domain })
    return new MutableProxy(startState, patch => {
      //  TODO: reject updates if user is not owner
      const activePatch = structuredClone(patch)
      activePatch.forEach(entry => entry.path.unshift('active'))
      interact(scope, activePatch)
    })
  }

  function reset(scope) {
    return interact(scope, [{ op: 'add', path:['active'], value: null }])
  }

  //  TODO: better approach than exposing addTag
  function interact(scope, patch, addTag=true) {
    if (addTag) tagIfNotYetTaggedInSession('mutated', scope)
    return send({ type: 'interact', scope, patch })
  }

  async function upload(name, type, data, id=uuid()) {
    const url = await send({ type: 'upload', name, contentType: type, id })

    if (data === undefined) return url
    else {
      const headers = { 'Content-Type': type }
      const response = await fetch(url, {method: 'PUT', headers, body: data})
      const { ok, statusText } = response

      if (ok) return id
      else throw new Error(statusText)
    }
  }

  function download(id) {
    let mode = 'fetch'
    const promise = new Promise(async (resolve, reject) => {
      const url = await send({ type: 'download', id })

//      await new Promise(r => setTimeout(r))
      if (mode === 'url') resolve(url)
      else if (mode === 'fetch') {
        const response = await fetch(url)
        const { ok, statusText } = response

        if (ok) resolve(response)
        else reject(statusText)
      }
      else if (mode === 'direct') {
        //  TODO: use browser progress UX instead of downloading all into memory first
        const res = await download(id)
        const { name } = await metadata(id)
        const type = res.headers.get('Content-Type')
        const blob = new Blob([ await res.blob() ], { type }) 
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = name
        document.body.appendChild(a)
        a.click()
        window.URL.revokeObjectURL(url)
        resolve()
      }
    })
    promise.direct = () => {
      mode = 'direct'
      return promise
    }
    promise.url = () => {
      mode = 'url'
      return promise
    }
    return promise
  }

  function isValidMetadataMutation({ path, op, value }) {
    return (
      ['active_type', 'name'].includes(path[0])
      && path.length === 1
      && typeof value === 'string' || op === 'remove'
    )
  }

  async function metadata(scope, user, domain) {
    const md = await send({ type: 'metadata', scope, user, domain })
    return new MutableProxy(md, patch => {
      const activePatch = structuredClone(patch)
      activePatch.forEach(entry => {
        if (!isValidMetadataMutation(entry)) throw new Error('You may only modify the type or name for a scope\'s metadata')
      })
      interact(scope, activePatch)
    })
  }

  function tag(tag_type, target, context=[]) {
    return send({ type: 'tag', tag_type, target, context })
  }

  function login(provider, username, password) {
    return send({ type: 'login', provider, username, password })
  }

  function query(query, params, domain) { return send({ type: 'query', query, params, domain }) }
  function logout() { return send({ type: 'logout' }) }
  function disconnect() { return send({ type: 'disconnect' }) }
  function reconnect() { return send({ type: 'reconnect' }) }
  function synced() { return send({ type: 'synced' }) }
  function close(info) { return send({ type: 'close', info }) }

  return {
    embedded: true,
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
    patch,
    reset,
    metadata,
    disconnect,
    reconnect,
    synced,
    close,
    query,
    tag
  }
}
