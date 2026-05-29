import { validate as isUUID, v1 as uuid } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'
import attachSynced from '../attach-synced.js'
import watchImplementation from '../watch.js'
import sync from '../sync.js'

export default function createEmbeddedAgent({
  addMessageListener=() => {},
  fetch,
  log=console.log,
  postMessage,
  saveDownload
}) {
  let messageIndex = 0
  let resolveSession
  const session = new Promise(r => resolveSession = r)
  const responses = {}
  const watchers = {}
  const sentUpdates = {}
  const pendingEchoCallbacks = new Set()

  function cloneMessage(message) {
    if (message === undefined || message === null) return message
    return typeof structuredClone === 'function'
      ? structuredClone(message)
      : JSON.parse(JSON.stringify(message))
  }

  async function send(message, setLastRequestId=() => {}) {
    const requestId = message.requestId || uuid()
    setLastRequestId(requestId)
    messageIndex += 1
    const outboundMessage = cloneMessage({
      ...message,
      requestId,
      index: messageIndex
    })
    try {
      outboundMessage.session = await session
      postMessage(outboundMessage)
      return new Promise((resolve, reject) => {
        responses[requestId] = { resolve, reject }
      })
    }
    catch (error) {
      log('ERROR POSTING MESSAGE UP', message, error)
    }
  }

  let variables
  let sessionResolved = false
  const agent = createAgent()

  addMessageListener(async data => {
    if (data.type === 'setup' && !sessionResolved) {
      sessionResolved = true
      resolveSession(data.session)
      postMessage({
        type: 'embedded-ready',
        session: data.session
      })
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
          // Repeated update for this scope.
        } else if (data.ii < sentUpdates[key]) {
          // Out of order update from the past.
        } else {
          sendUpdate()
        }
      }
    }
  })

  function createAgent(runId) {
    let lastRequestId
    const interactionQueue = []
    let interactionFlushPromise = null
    let lastQueuedInteraction = null

    function scopedSend(message) {
      return send(runId === undefined ? message : { ...message, runId }, requestId => {
        lastRequestId = requestId
      })
    }

    function scheduleInteractionFlush() {
      if (!interactionFlushPromise) {
        interactionFlushPromise = Promise.resolve().then(flushInteractionQueue)
      }
      return interactionFlushPromise
    }

    function flushInteractionQueue() {
      const queued = interactionQueue.splice(0)
      lastQueuedInteraction = null
      interactionFlushPromise = null

      queued.forEach(entry => {
        scopedSend({
          type: 'interact',
          requestId: entry.requestId,
          scope: entry.scope,
          patch: entry.patch,
          context: entry.context
        }).then(entry.resolve, entry.reject)
      })
    }

    function flushQueuedInteractions() {
      if (interactionQueue.length) return scheduleInteractionFlush()
      return interactionFlushPromise || Promise.resolve()
    }

    async function sendAfterQueuedInteractions(message) {
      await flushQueuedInteractions()
      return scopedSend(message)
    }

    function queueInteraction(scope, patch, context) {
      if (lastQueuedInteraction?.scope === scope) {
        lastQueuedInteraction.patch.push(...cloneMessage(patch))
        return lastQueuedInteraction.promise
      }

      const requestId = uuid()
      let resolve
      let reject
      const entry = {
        requestId,
        scope,
        patch: cloneMessage(patch),
        context: cloneMessage(context),
        promise: new Promise((res, rej) => {
          resolve = res
          reject = rej
        })
      }
      entry.resolve = resolve
      entry.reject = reject

      lastRequestId = requestId
      interactionQueue.push(entry)
      lastQueuedInteraction = entry
      scheduleInteractionFlush()
      return entry.promise
    }

    async function environment(user) {
      const response = await sendAfterQueuedInteractions({ type: 'environment', user })
      if (variables === undefined && response.variables !== undefined) {
        variables = response.variables
      }
      return variables === undefined ? response : { ...response, variables }
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
      return sendAfterQueuedInteractions({ type: 'patch', root, scopes })
    }

    function state(scope, user, domain) {
      return attachSynced(watchers, (ctx, resolveSync) => (async () => {
        if (scope === undefined) {
          const { context } = await environment()
          scope = JSON.stringify(context)
        }
        const startState = await sendAfterQueuedInteractions({ type: 'state', scope, user, domain })
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
              echoBatch = currentEchoBatch = { resolve: resolveEcho, resolved: false }
              pendingEchoCallbacks.add(echoPromise)
              echoPromise.then(() => pendingEchoCallbacks.delete(echoPromise))
              Promise.resolve().then(() => { currentEchoBatch = null })
            }
            else echoBatch = currentEchoBatch
          }
          const interactPromise = interact(scope, activePatch)
          const p = interactPromise.then(
            r => {
              ctx.ownInteractions.add(r.ii)
              if (echoBatch) ctx.ownInteractionBatches.set(r.ii, echoBatch)
              ctx.pendingInteractions.delete(p)
            },
            () => {
              if (echoBatch && !echoBatch.resolved) {
                echoBatch.resolved = true
                echoBatch.resolve()
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
      return queueInteraction(scope, patch, context)
    }

    async function upload(info) {
      let { name, type, data, id=uuid() } = info || {}

      const url = await sendAfterQueuedInteractions({ type: 'upload', info: { name, type, id } })

      if (data === undefined) return url

      if (!fetch) throw new Error('EmbeddedAgent upload with data requires a fetch implementation')

      const headers = { 'Content-Type': type }
      const response = await fetch(url, {method: 'PUT', headers, body: data})
      const { ok, statusText } = response

      if (ok) return id
      else throw new Error(statusText)
    }

    function download(id) {
      let mode = 'fetch'
      const promise = new Promise(async (resolve, reject) => {
        try {
          const url = await sendAfterQueuedInteractions({ type: 'download', id })

          await new Promise(r => setTimeout(r))
          if (mode === 'url') resolve(url)
          else {
            if (!fetch) throw new Error('EmbeddedAgent download requires a fetch implementation')

            if (mode === 'fetch') {
              const response = await fetch(url)
              const { ok, statusText } = response

              if (ok) resolve(response)
              else reject(statusText)
            }
            else if (mode === 'direct') {
              if (!saveDownload) throw new Error('EmbeddedAgent direct download requires a saveDownload implementation')

              const res = await download(id)
              const { name } = await metadata(id)
              await saveDownload(res, name)
              resolve()
            }
          }
        }
        catch (error) {
          reject(error)
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
      const md = await sendAfterQueuedInteractions({ type: 'metadata', scope, user, domain })
      return new PatchProxy(md, patch => {
        const activePatch = structuredClone(patch)
        activePatch.forEach(entry => {
          if (!isValidMetadataMutation(entry)) throw new Error('You may only modify the type or name for a scope\'s metadata')
        })
        interact(scope, activePatch)
      })
    }

    function login(provider, username, password) {
      return sendAfterQueuedInteractions({ type: 'login', provider, username, password })
    }

    function query(query, params, domain, context=[]) { return sendAfterQueuedInteractions({ type: 'query', query, params, domain, context }) }
    function logout() { return sendAfterQueuedInteractions({ type: 'logout' }) }
    function disconnect() { return sendAfterQueuedInteractions({ type: 'disconnect' }) }
    function reconnect() { return sendAfterQueuedInteractions({ type: 'reconnect' }) }
    async function synced() {
      const echoSnapshot = [...pendingEchoCallbacks]
      await flushQueuedInteractions()
      await scopedSend({ type: 'synced' })
      if (echoSnapshot.length) await Promise.all(echoSnapshot)
    }
    function close(info) { return sendAfterQueuedInteractions({ type: 'close', info }) }
    function guarantee(script, namespaces, context) { return sendAfterQueuedInteractions({ type: 'guarantee', script, namespaces, context }) }
    function response(id=lastRequestId) { return sendAfterQueuedInteractions({ type: 'response', id }) }
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
