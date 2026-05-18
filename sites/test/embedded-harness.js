import EmbeddedAgent from '../../packages/agents/agents/embedded.js'
import createEmbed from '../../packages/agents/agents/embed.js'
import runEmbeddedMode from './embedded-modes.js'

const DEFAULT_URL = 'https://localhost:5112/'
const DEFAULT_LANGUAGES = ['en-US']

function defineGlobal(name, value) {
  Object.defineProperty(globalThis, name, {
    configurable: true,
    writable: true,
    value
  })
}

function normalizeEmbeddedId(value) {
  if (typeof value !== 'string') return ''

  try {
    if (value.startsWith('http://') || value.startsWith('https://')) {
      return new URL(value).pathname.replace(/^\//, '')
    }
  }
  catch (_) {}

  return value.replace(/^\//, '')
}

class BasicEvent {
  constructor(type) {
    this.type = type
    this.target = null
  }
}

class BasicMessageEvent extends BasicEvent {
  constructor(type, { data }={}) {
    super(type)
    this.data = data
  }
}

class BasicEventTarget {
  constructor() {
    this.listeners = {}
  }

  addEventListener(type, fn) {
    if (!this.listeners[type]) this.listeners[type] = new Set()
    this.listeners[type].add(fn)
  }

  removeEventListener(type, fn) {
    this.listeners[type]?.delete(fn)
  }

  dispatchEvent(event) {
    event.target = this
    ;[...(this.listeners[event.type] || [])].forEach(listener => listener(event))
    return true
  }
}

class BasicNode {
  constructor(tagName='') {
    this.tagName = tagName.toUpperCase()
    this.parentNode = null
    this.childNodes = []
    this.style = ''
  }

  appendChild(child) {
    if (child.parentNode) child.parentNode.removeChild(child)
    this.childNodes.push(child)
    child.parentNode = this
    return child
  }

  removeChild(child) {
    const index = this.childNodes.indexOf(child)
    if (index === -1) throw new Error('Child not found')
    this.childNodes.splice(index, 1)
    child.parentNode = null
    return child
  }

  remove() {
    if (this.parentNode) this.parentNode.removeChild(this)
  }
}

class BasicElement extends BasicNode {
  constructor(tagName) {
    super(tagName)
  }
}

class BasicAnchorElement extends BasicElement {
  constructor() {
    super('a')
    this.href = ''
    this.download = ''
  }

  click() {}
}

class BasicStorage {
  constructor() {
    this.values = new Map()
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null
  }

  setItem(key, value) {
    this.values.set(String(key), String(value))
  }

  removeItem(key) {
    this.values.delete(String(key))
  }

  clear() {
    this.values.clear()
  }
}

function childRuntime(parentWindow, environment) {
  const listeners = []

  const Agent = EmbeddedAgent(
    message => {
      parentWindow.dispatchEvent(new parentWindow.MessageEvent('message', { data: message }))
    },
    {
      addMessageListener: listener => listeners.push(listener),
      fetch: parentWindow.fetch.bind(parentWindow),
      saveDownload: async (response, name) => {
        const type = response.headers.get('Content-Type')
        const blob = new Blob([ await response.blob() ], { type })
        const url = parentWindow.URL.createObjectURL(blob)
        const a = parentWindow.document.createElement('a')
        a.style.display = 'none'
        a.href = url
        a.download = name
        parentWindow.document.body.appendChild(a)
        a.click()
        parentWindow.URL.revokeObjectURL(url)
      }
    }
  )
  Agent.embed = createEmbed(() => Agent)
  installEmbeddedTargetHarness(Agent)

  const id = normalizeEmbeddedId(environment.id)

  runEmbeddedMode({ Agent, id, mode: environment.mode }).catch(error => {
    console.error('Embedded harness child error', error)
    Agent.close({
      __embeddedHarnessError: error.message,
      stack: error.stack
    })
  })

  return {
    agent: Agent,
    receive(data) {
      listeners.forEach(listener => listener(data))
    }
  }
}

class EmbeddedTarget extends BasicElement {
  constructor(parentWindow) {
    super('iframe')
    this.__embeddedHarnessEnvironment = null
    this.__embeddedHarnessParentWindow = parentWindow
    this.__embeddedHarnessChild = null
    this.__embeddedHarnessSource = ''
    this.__embeddedHarnessLoadHandler = () => {}
    this.contentWindow = {
      postMessage: message => this.postMessage(message)
    }
  }

  load(source) {
    this.__embeddedHarnessSource = source
    this.__embeddedHarnessChild = childRuntime(
      this.__embeddedHarnessParentWindow,
      this.__embeddedHarnessEnvironment || {}
    )
    queueMicrotask(() => this.__embeddedHarnessLoadHandler())
  }

  postMessage(message) {
    this.__embeddedHarnessChild?.receive(message)
  }

  setLoadHandler(handler) {
    this.__embeddedHarnessLoadHandler = handler
  }

  isMounted() {
    return !!this.parentNode
  }

  get src() {
    return this.__embeddedHarnessSource
  }

  set src(source) {
    this.load(source)
  }
}

class BasicDocument {
  constructor(parentWindow) {
    this.body = new BasicElement('body')
    this.defaultView = parentWindow
  }

  createElement(tagName) {
    const lower = String(tagName).toLowerCase()
    if (lower === 'iframe') return new EmbeddedTarget(this.defaultView)
    if (lower === 'a') return new BasicAnchorElement()
    return new BasicElement(lower)
  }
}

class BasicWindow extends BasicEventTarget {
  constructor(url) {
    super()

    const location = new URL(url)
    location.reload = () => {}

    const URLConstructor = globalThis.URL
    if (!URLConstructor.createObjectURL) URLConstructor.createObjectURL = () => 'blob:embedded-harness'
    if (!URLConstructor.revokeObjectURL) URLConstructor.revokeObjectURL = () => {}

    this.window = this
    this.self = this
    this.top = this
    this.parent = this
    this.location = location
    this.navigator = {
      languages: [...(globalThis.navigator?.languages || DEFAULT_LANGUAGES)]
    }
    this.localStorage = globalThis.localStorage || new BasicStorage()
    this.document = new BasicDocument(this)
    this.Event = BasicEvent
    this.MessageEvent = BasicMessageEvent
    this.URL = URLConstructor
    this.fetch = globalThis.fetch.bind(globalThis)
    this.WebSocket = globalThis.WebSocket
    this.Blob = globalThis.Blob
    this.Response = globalThis.Response
    this.Request = globalThis.Request
    this.Headers = globalThis.Headers
    this.setTimeout = setTimeout.bind(globalThis)
    this.clearTimeout = clearTimeout.bind(globalThis)
    this.requestAnimationFrame = callback => setTimeout(() => callback(Date.now()), 16)
    this.cancelAnimationFrame = timer => clearTimeout(timer)
    this.close = () => {}
  }
}

export function createEmbeddedTarget(parentWindow=window) {
  return new EmbeddedTarget(parentWindow)
}

export function installTestEnvironment({
  url=DEFAULT_URL
}={}) {
  const window = new BasicWindow(url)

  defineGlobal('window', window)
  defineGlobal('self', window)
  defineGlobal('document', window.document)
  defineGlobal('navigator', window.navigator)
  defineGlobal('location', window.location)
  defineGlobal('localStorage', window.localStorage)
  defineGlobal('addEventListener', window.addEventListener.bind(window))
  defineGlobal('removeEventListener', window.removeEventListener.bind(window))
  defineGlobal('dispatchEvent', window.dispatchEvent.bind(window))
  defineGlobal('Event', window.Event)
  defineGlobal('MessageEvent', window.MessageEvent)

  return window
}

export function installEmbeddedTargetHarness(Agent) {
  if (Agent.__embeddedHarnessWrapped) return
  const originalEmbed = Agent.embed.bind(Agent)
  Agent.embed = (environment, target) => {
    target.__embeddedHarnessEnvironment = environment
    return originalEmbed(environment, target)
  }
  Agent.__embeddedHarnessWrapped = true
}
