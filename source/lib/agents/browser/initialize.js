import RootAgent from './root.js'
import EmbeddedAgent from './embedded.js'
import { v1 as uuid, validate as validateUUID } from 'uuid'

let Agent

export default function browserAgent() {
  if (Agent) return Agent

  let embedded

  try { embedded = window.self !== window.top }
  catch (e) { embedded = true }

  Agent = embedded ? EmbeddedAgent() : RootAgent()
  Agent.embed = embed

  return Agent
}

const copy = x => JSON.parse(JSON.stringify(x))

const watchers = {}

function embed(environment, iframe) {
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

    const sendDown = response => postMessage({ requestId, response })

    if (type === 'error') {
      console.error(message)
      sendDown({})
    }
    else if (type === 'close') {
      if (listeners.close) listeners.close()
    }
    else if (type === 'environment') {
      const env = await Agent.environment()
      const context = [...env.context, environment.id]
      Object.assign(env, { ...env, context })
      sendDown(env)
    }
    else if (type === 'interact') {
      const { scope, patch } = message
      await Agent.interact(scope, patch)
      if (listeners.mutate) listeners.mutate({ scope })
      sendDown({}) // TODO: might want to send down the interaction index
    }
    else if (type === 'metadata') {
      sendDown(await Agent.metadata(message.scope))
    }
    else if (type === 'tag') {
      const { tag_type, target, context } = message
      const prependedContext = [environment.id, ...context]
      sendDown(await Agent.tag(tag_type, target, prependedContext))
    }
    else if (type === 'state') {
      const { scope } = message

      const statePromise = Agent.state(scope)

      if (!watchers[scope]) watchers[scope] = Agent.watch(scope, postMessage)

      if (listeners.state) listeners.state({ scope })
      sendDown(await statePromise)
    }
    else if (type === 'patch') {
      const { root, scopes } = message
      sendDown(await Agent.patch(root, scopes))
    }
    else if (type === 'upload') {
      const { name, contentType, id } = message
      sendDown(await Agent.upload(name, contentType, undefined, id))
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

  //  write in a temporary loading notification while frame loads
  const cw = iframe.contentWindow
  if (cw) cw.document.body.innerHTML = 'Loading...'

  //  TODO: make sure content security policy headers for embedded domain always restrict iframe
  //        src to only self for embedded domain
  iframe.onload = () => {
    frameLoaded = true
    processPostMessageQueue()
  }

  setUpEmbeddedFrame()

  async function setUpEmbeddedFrame() {
    browserAgent()

    const { protocol } = window.location
    const { id } = environment
    if (validateUUID(id)) {
      const { domain } = await Agent.metadata(id)
      iframe.src = `${protocol}//${domain}/${id}`
    }
    else iframe.src = id //  TODO: ensure is url

    while(!embeddedAgentInitialized) {
      postMessage({ type: 'setup', session })
      await new Promise(r => setTimeout(r, 100))
    }
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
