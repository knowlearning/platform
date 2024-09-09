import Agent from './browser.js'
import { validate as validateUUID } from 'uuid'

function getNamespacedScope(namespace, scope) {
  const allow = namespace?.allow || []
  const prefix = typeof namespace === 'string' ? namespace : namespace?.prefix
  return prefix && !validateUUID(scope) && !allow.some(allowPrefix => scope.startsWith(allowPrefix)) ? `${prefix}/${scope}` : scope
}

function copy(value) {
  return JSON.parse(JSON.stringify(value))
}

export default function embed(environment, iframe) {
  const watchers = {}
  const postMessageQueue = []
  const listeners = {}
  let frameLoaded = false
  let embeddedAgentInitialized = false

  const session = uuid()

  const postMessage = m => new Promise((resolve, reject) => {
    const message = { ...copy(m), session }
    postMessageQueue.push({ message, sent: resolve })
    if (frameLoaded) processPostMessageQueue()
  })

  const processPostMessageQueue = () => {
    while (iframe.parentNode && postMessageQueue.length) {
      const { message, sent } = postMessageQueue.shift()
      iframe.contentWindow.postMessage(message, '*')
      sent()
    }
  }

  const handleMessage = async message => {
    const { requestId, type } = message

    const sendDown = (response, error) => postMessage({ requestId, response, error })

    if (type === 'error') {
      console.error(message)
      sendDown({})
    }
    else if (type === 'close') {
      if (listeners.close) listeners.close(message.info)
    }
    else if (type === 'environment') {
      const { user } = message
      const env = await (listeners.environment ? listeners.environment(user) : Agent.environment(user))
      sendDown({ ...env, context: [...(env.context || []), environment.id], mode: environment.mode })
    }
    else if (type === 'interact') {
      let { scope, patch } = message
      const namespacedScope = getNamespacedScope(environment.namespace, scope)
      await Agent.interact(namespacedScope, patch, false)
      if (listeners.mutate) listeners.mutate({ scope: namespacedScope })
      sendDown({}) // TODO: might want to send down the interaction index
    }
    else if (type === 'metadata') {
      const { scope, user, domain } = message
      const namespacedScope = getNamespacedScope(environment.namespace, scope)

      sendDown(await Agent.metadata(namespacedScope, user, domain))
    }
    else if (type === 'state') {
      const { scope, user, domain } = message
      const namespacedScope = getNamespacedScope(environment.namespace, scope)

      const statePromise = Agent.state(namespacedScope, user, domain)

      const key = `${ domain || ''}/${user || ''}/${namespacedScope}`
      if (!watchers[key]) {
        watchers[key] = Agent.watch(namespacedScope, m => postMessage({ ...m, scope }), user, domain)
      }

      if (listeners.state) listeners.state({ scope })
      sendDown(await statePromise)
    }
    else if (type === 'patch') {
      const { root, scopes } = message
      sendDown(await Agent.patch(root, scopes))
    }
    else if (type === 'query') {
      const { query, params, domain } = message
      Agent
        .query(query, params, domain)
        .then(sendDown)
        .catch(error => sendDown(null, error.error))
    }
    else if (type === 'upload') {
      const { info } = message
      sendDown(await Agent.upload(info))
    }
    else if (type === 'download') {
      sendDown(await Agent.download(message.id).url())
    }
    else if (type === 'login') {
      const { provider, username, password } = message
      sendDown(await Agent.login(provider, username, password))
    }
    else if (type === 'logout') Agent.logout()
    else if (type === 'disconnect') sendDown(await Agent.disconnect())
    else if (type === 'reconnect') sendDown(await Agent.reconnect())
    else if (type === 'synced') sendDown(await Agent.synced())
    else {
      console.log('Unknown message type passed up...', message)
      sendDown({})
    }
  }

  window.addEventListener('message', ({ data }) => {
    if (data.session === session) {
      embeddedAgentInitialized = true
      //  TODO: ensure message index ordering!!!!!!!!!!!!!!!!!!!! (no order guarantee given in postMessage protocol, so we need to make a little buffer here)
      handleMessage(data)
    }
  })

  //  TODO: make sure content security policy headers for embedded domain always restrict iframe
  //        src to only self for embedded domain
  iframe.onload = () => {
    frameLoaded = true
    processPostMessageQueue()
  }

  setUpEmbeddedFrame()

  async function setUpEmbeddedFrame() {
    const { protocol } = window.location
    const { id } = environment
    if (validateUUID(id)) {
      const { domain } = await Agent.metadata(id)
      iframe.src = `${protocol}//${domain}/${id}`
    }
    else iframe.src = id //  TODO: ensure is url

    while(!embeddedAgentInitialized) {
      //  TODO: wait for any other agents that are initializing from other potential root agents
      postMessage({ type: 'setup', session })
      await new Promise(r => setTimeout(r, 100))
    }
    if (listeners.open) listeners.open()
  }

  function remove () {
    if (iframe.parentNode) iframe.parentNode.removeChild(iframe)
  }

  function on(event, fn) {
    listeners[event] = fn
  }

  function auth(token, state) {
    postMessage({ type: 'auth', token, state })
  }

  return {
    auth,
    remove,
    on
  }
}
