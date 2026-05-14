import { validate as isUUID, v1 as uuid } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'
import attachSynced from './attach-synced.js'
import watchImplementation from './watch.js'
import sync from './sync.js'

export default function EmbeddedAgent(postMessage) {
  let messageIndex = 0
  let resolveSession
  const session = new Promise(r => resolveSession = r)
  const responses = {}
  const watchers = {}
  const sentUpdates = {}
  const pendingEchoCallbacks = new Set()

  async function send(message, setLastRequestId) {
    const requestId = message.requestId || uuid()
    setLastRequestId(requestId)
    messageIndex += 1
    try {
      postMessage({
        ...message,
        session: await session,
        requestId,
        index: messageIndex
      })
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
      const { auth, domain:rootDomain } = await agent.environment()
      const d = !domain || domain === rootDomain ? '' : domain
      const u = !user || auth.user === user ? '' : user
      const key = isUUID(scope) ? scope : `${d}/${u}/${scope}`

      const sendUpdate = () => {
        sentUpdates[key] = data.ii
        watchers[key].forEach(fn => fn(data))
      }
      if (watchers[key]) {
        if (sentUpdates[key] === undefined || sentUpdates[key] + 1 === data.ii) {
          sendUpdate()
        } else if (data.ii === sentUpdates[key]) {
          //console.warn('Repeated update for', key, data, sentUpdates[key])
        } else if (data.ii < sentUpdates[key]) {
           //console.warn('Out of order update, from past', key, JSON.stringify(data, null, 4), sentUpdates[key])
        } else {
          //console.warn('Out of order update, fast forward', key, JSON.stringify(data, null, 4), sentUpdates[key])
          sendUpdate()
        }
      }
    }
  })

  let variables

  const agent = createAgent()

  function createAgent(runId) {
    let lastRequestId

    function scopedSend(message) {
      return send(runId === undefined ? message : { ...message, runId }, requestId => {
        lastRequestId = requestId
      })
    }

    async function environment(user) {
      const response = await scopedSend({ type: 'environment', user })
      //  keep copy on initialize symantics for environment variables
      if (!variables && !user) variables = response.variables
      return { ...response, variables }
    }

    function create({ id=uuid(), active_type, active }) {
      if (!active_type) active_type = 'application/json'
      interact(id, [
        { op: 'add', path: ['active_type'], value: active_type },
        { op: 'add', path: ['active'], value: active }
      ])
      return id
    }

    async function patch(root, scopes) {
      //  TODO: consider watch function added to return to receive progress
      return scopedSend({ type: 'patch', root, scopes })
    }

    function state(scope, user, domain) {
      return attachSynced(watchers, (ctx, resolveSync) => (async () => {
        if (scope === undefined) {
          const { context } = await environment()
          scope = JSON.stringify(context)
        }
        const startState = await scopedSend({ type: 'state', scope, user, domain })
        const { auth, domain: rootDomain } = await environment()
        const d = !domain || domain === rootDomain ? '' : domain
        const u = !user || auth.user === user ? '' : user
        const key = isUUID(scope) ? scope : `${d}/${u}/${scope}`
        if (!ctx.ownInteractions) ctx.ownInteractions = new Set()
        if (!ctx.ownInteractionBatches) ctx.ownInteractionBatches = new Map()
        if (!ctx.pendingInteractions) ctx.pendingInteractions = new Set()
        if (!ctx.echoResolvers) ctx.echoResolvers = []
        let currentEchoBatch = null
        const proxy = new PatchProxy(startState, patch => {
          //  TODO: reject updates if user is not owner
          if (ctx.applyingExternalUpdate) return
          const activePatch = structuredClone(patch)
          activePatch.forEach(entry => entry.path.unshift('active'))
          let echoBatch
          if (ctx.syncActive) {
            if (!currentEchoBatch) {
              let resolveEcho
              const echoPromise = new Promise(r => resolveEcho = r)
              echoBatch = currentEchoBatch = { remaining: 0, resolve: resolveEcho, resolved: false }
              pendingEchoCallbacks.add(echoPromise)
              echoPromise.then(() => pendingEchoCallbacks.delete(echoPromise))
              Promise.resolve().then(() => { currentEchoBatch = null })
            }
            else echoBatch = currentEchoBatch
            echoBatch.remaining += 1
          }
          const interactPromise = interact(scope, activePatch)
          const p = interactPromise.then(
            r => {
              ctx.ownInteractions.add(r.ii)
              if (echoBatch) ctx.ownInteractionBatches.set(r.ii, echoBatch)
              ctx.pendingInteractions.delete(p)
            },
            () => {
              if (echoBatch) {
                echoBatch.remaining -= 1
                if (echoBatch.remaining === 0 && !echoBatch.resolved) {
                  echoBatch.resolved = true
                  echoBatch.resolve()
                }
              }
              ctx.pendingInteractions.delete(p)
            }
          )
          ctx.pendingInteractions.add(p)
        })
        resolveSync(proxy, key)
        return proxy
      })())
    }

    function reset(scope) {
      return interact(scope, [{ op: 'add', path:['active'], value: null }])
    }

    function interact(scope, patch, _, context) {
      return scopedSend({ type: 'interact', scope, patch, context })
    }

    async function upload(info) {
      let { name, type, data, id=uuid() } = info || {}

      const url = await scopedSend({ type: 'upload', info: { name, type, id } })

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
        const url = await scopedSend({ type: 'download', id })

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
      const md = await scopedSend({ type: 'metadata', scope, user, domain })
      return new PatchProxy(md, patch => {
        const activePatch = structuredClone(patch)
        activePatch.forEach(entry => {
          if (!isValidMetadataMutation(entry)) throw new Error('You may only modify the type or name for a scope\'s metadata')
        })
        interact(scope, activePatch)
      })
    }

    function login(provider, username, password) {
      return scopedSend({ type: 'login', provider, username, password })
    }

    function query(query, params, domain, context=[]) { return scopedSend({ type: 'query', query, params, domain, context }) }
    function logout() { return scopedSend({ type: 'logout' }) }
    function disconnect() { return scopedSend({ type: 'disconnect' }) }
    function reconnect() { return scopedSend({ type: 'reconnect' }) }
    async function synced() {
      const echoSnapshot = [...pendingEchoCallbacks]
      await scopedSend({ type: 'synced' })
      if (echoSnapshot.length) await Promise.all(echoSnapshot)
    }
    function close(info) { return scopedSend({ type: 'close', info }) }
    function guarantee(script, namespaces, context) { return scopedSend({ type: 'guarantee', script, namespaces, context }) }
    function response(id=lastRequestId) { return scopedSend({ type: 'response', id }) }
    function withRunId(nextRunId) { return createAgent(nextRunId) }

    const [ watch ] = watchImplementation({ metadata, state, watchers, synced, sentUpdates, environment })

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
      response,
      sync,
      query,
      withRunId
    }
  }

  return agent
}
