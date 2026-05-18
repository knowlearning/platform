import { v1 as uuid, validate as validateUUID } from 'uuid'
import isDomain from './browser/is-domain.js'

function getNamespacedScope(namespace, scope) {
  const allow = namespace?.allow || []
  const prefix = typeof namespace === 'string' ? namespace : namespace?.prefix
  return prefix && !validateUUID(scope) && !allow.some(allowPrefix => scope.startsWith(allowPrefix)) ? `${prefix}/${scope}` : scope
}

const copy = value => JSON.parse(JSON.stringify(value))

function normalizeTarget(target) {
  if (
    typeof target?.load === 'function'
    && typeof target?.postMessage === 'function'
    && typeof target?.setLoadHandler === 'function'
    && typeof target?.remove === 'function'
    && typeof target?.isMounted === 'function'
  ) {
    return target
  }

  return {
    load(source) {
      target.src = source
    },
    postMessage(message) {
      target.contentWindow.postMessage(message, '*')
    },
    setLoadHandler(handler) {
      target.onload = handler
    },
    remove() {
      if (typeof target.remove === 'function') target.remove()
      else if (target.parentNode) target.parentNode.removeChild(target)
    },
    isMounted() {
      if (typeof target.isConnected === 'boolean') return target.isConnected
      return !!target.parentNode
    }
  }
}

export default function createEmbed(getRootAgent) {
  return function embed(environment, passedTarget) {
    const Agent = getRootAgent()
    const target = normalizeTarget(passedTarget)
    const watchers = {}
    const postMessageQueue = []
    const listeners = {}
    const responses = {}
    let frameLoaded = false
    let embeddedAgentInitialized = false

    const session = uuid()

    const postMessage = message => new Promise(resolve => {
      const payload = { ...copy(message), session }
      postMessageQueue.push({ message: payload, sent: resolve })
      if (frameLoaded) processPostMessageQueue()
    })

    const processPostMessageQueue = () => {
      while (target.isMounted() && postMessageQueue.length) {
        const { message, sent } = postMessageQueue.shift()
        target.postMessage(message)
        sent()
      }
    }

    const handleMessage = async message => {
      const { requestId, type } = message

      const sendDown = (response, error) => {
        if (responses[requestId]) responses[requestId](response, error)
        postMessage({ requestId, response, error })
      }

      if (type === 'error') {
        console.error(message)
        sendDown({})
      }
      else if (type === 'close') {
        if (listeners.close) listeners.close(message.info)
      }
      else if (type === 'environment') {
        const { user } = message
        const { mode, variables={} } = environment

        const env = await (listeners.environment ? listeners.environment(user) : Agent.environment(user))

        sendDown({
          ...env,
          context: [
            ...(env.context || []),
            environment.id
          ],
          variables: {
            ...(env.variables || {}),
            ...variables
          },
          mode
        })
      }
      else if (type === 'interact') {
        const { scope, patch, context=[] } = message
        const namespacedScope = getNamespacedScope(environment.namespace, scope)
        let before
        if (listeners.mutate) before = copy(await Agent.state(namespacedScope))
        const response = await Agent.interact(namespacedScope, patch, true, [environment.id, ...context])
        if (listeners.mutate) {
          const patchCopy = copy(patch)
          patchCopy.forEach(op => op.path.shift())
          listeners.mutate({
            scope: namespacedScope,
            before,
            after: copy(await Agent.state(namespacedScope)),
            patch: patchCopy
          })
        }
        sendDown(response)
      }
      else if (type === 'metadata') {
        const { scope, user, domain } = message
        sendDown(await Agent.metadata(getNamespacedScope(environment.namespace, scope), user, domain))
      }
      else if (type === 'state') {
        const { scope, user, domain } = message
        const namespacedScope = getNamespacedScope(environment.namespace, scope)
        const statePromise = Agent.state(namespacedScope, user, domain)
        const key = `${domain || ''}/${user || ''}/${namespacedScope}`

        if (!watchers[key]) {
          watchers[key] = Agent.watch(namespacedScope, update => postMessage({ ...update, scope }), user, domain)
        }

        if (listeners.state) listeners.state({ scope })
        sendDown(await statePromise)
      }
      else if (type === 'patch') {
        sendDown(await Agent.patch(message.root, message.scopes))
      }
      else if (type === 'query') {
        const { query, params, domain, context=[] } = message
        Agent
          .query(query, params, domain, [environment.id, ...context])
          .then(sendDown)
          .catch(error => sendDown(null, error))
      }
      else if (type === 'upload') {
        sendDown(await Agent.upload(message.info))
      }
      else if (type === 'download') {
        sendDown(await Agent.download(message.id).url())
      }
      else if (type === 'login') {
        sendDown(await Agent.login(message.provider, message.username, message.password))
      }
      else if (type === 'logout') Agent.logout()
      else if (type === 'disconnect') sendDown(await Agent.disconnect())
      else if (type === 'reconnect') sendDown(await Agent.reconnect())
      else if (type === 'synced') sendDown(await Agent.synced())
      else if (type === 'guarantee') {
        const { script, namespaces=[], context=[] } = message
        sendDown(await Agent.guarantee(script, [environment.namespace || '', ...namespaces], [environment.id, ...context]))
      }
      else if (type === 'response') {
        const { id } = message
        responses[id] = (response, error) => {
          delete responses[id]
          sendDown(response, error)
        }
      }
      else {
        console.warn('Unknown message type passed up...', message)
        sendDown({})
      }
    }

    window.addEventListener('message', ({ data }) => {
      if (data.session === session) {
        embeddedAgentInitialized = true
        if (data.type === 'embedded-ready') return
        handleMessage(data)
      }
    })

    target.setLoadHandler(() => {
      frameLoaded = true
      processPostMessageQueue()
    })

    setUpEmbeddedFrame()

    async function setUpEmbeddedFrame() {
      const { protocol } = window.location
      const { id } = environment

      if (validateUUID(id)) {
        const { domain } = await Agent.metadata(id)
        const player = (await Agent.state(id))?.reference?.player
        target.load(`${protocol}//${isDomain(player) ? player : domain}/${id}`)
      }
      else {
        target.load(id)
      }

      while (!embeddedAgentInitialized) {
        postMessage({ type: 'setup', session })
        await new Promise(resolve => setTimeout(resolve, 100))
      }

      if (listeners.open) listeners.open()
    }

    return {
      auth(token, state) {
        postMessage({ type: 'auth', token, state })
      },
      remove() {
        target.remove()
      },
      on(event, fn) {
        listeners[event] = fn
        return this
      }
    }
  }
}
