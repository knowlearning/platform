import { validate as isUUID, v1 as uuid } from 'uuid'

export default function EmbeddedAgent() {
  let messageIndex = 0
  let resolveSession
  const session = new Promise(r => resolveSession = r)
  const responses = {}
  const watchers = {}
  const sentUpdates = {}

  async function send(message, callback) {
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
        responses[requestId] = { resolve, reject, callback }
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
      const { resolve, reject, callback } = responses[data.requestId]
      if (data.error) reject(data.error)
      else {
        resolve(data.response)
        if (callback) callback(data.response)
        else delete responses[data.requestId]
      }
    }
  })

  function environment(user) {
    return send({ type: 'environment', user })
  }

  function create({ id=uuid(), active_type, active }) {
    if (!active_type) active_type = 'application/json'
    interact(id, [
      { metadata: true, op: 'add', path: ['type'], value: active_type },
      { op: 'add', path: [], value: active }
    ])
    return id
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
    const startState = await send({ type: 'state', scope, user, domain })

    //  TODO: reject updates if user is not owner
    return new PatchProxy(startState, patch => interact(scope, patch))
  }

  async function watch(scope, callback, user, domain) {
    await send({ type: 'watch', scope, user, domain}, callback)
  }

  function reset(scope) {
    return interact(scope, [{ op: 'add', path:[], value: null }])
  }

  function interact(scope, patch) {
    return send({ type: 'interact', scope, patch })
  }

  async function upload(info) {
    let { name, type, data, id=uuid() } = info || {}

    const url = await send({ type: 'upload', info: { name, type, id } })

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

      await new Promise(r => setTimeout(r))
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
    return new PatchProxy(md, patch => {
      const activePatch = structuredClone(patch)
      activePatch.forEach(entry => {
        if (!isValidMetadataMutation(entry)) throw new Error('You may only modify the type or name for a scope\'s metadata')
      })
      interact(scope, activePatch)
    })
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
    query
  }
}
