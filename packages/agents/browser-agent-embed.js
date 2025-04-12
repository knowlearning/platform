import browserAgent from './agents/browser/initialize.js'

const Agent = browserAgent()

class AgentEmbed extends HTMLElement {
  static get observedAttributes() {
    return ['id']
  }

  constructor() {
    super()
    this.attachShadow({ mode: 'open' })
    this.iframe = null
    this.resolvedId = null
    this.embedding = null
    this.stopWatching = null
  }

  connectedCallback() {
    this.render()
    this.startWatching()
  }

  disconnectedCallback() {
    if (this.embedding) this.embedding.remove()
    if (this.stopWatching) this.stopWatching()
  }

  attributeChangedCallback(name, oldValue, newValue) {
    if (oldValue !== newValue && name === 'id') this.startWatching()
  }

  get id() {
    return this.propId
  }

  set id(value) {
    this.propId = value
  }

  get mode() {
    return this.getAttribute('mode')
  }

  get path() {
    return this._path || []
  }

  set path(value) {
    this._path = value
    this.startWatching()
  }

  get namespace() {
    return this._namespace
  }

  set namespace(value) {
    this._namespace = value
  }

  get environmentProxy() {
    return this._environmentProxy
  }

  set environmentProxy(fn) {
    this._environmentProxy = fn
  }

  startWatching() {
    if (this.stopWatching) this.stopWatching()
    if (this.path?.length) {
      this.stopWatching = Agent.watch([this.id, ...this.path], value => {
        this.resolvedId = value
        this.render()
      })
    } else {
      this.resolvedId = this.id
      this.render()
    }
  }

  render() {
    if (!this.resolvedId) return
    this.shadowRoot.innerHTML = ''

    const iframe = document.createElement('iframe')
    iframe.style.width = '100%'
    iframe.style.height = '100%'
    iframe.style.border = 'none'
    iframe.setAttribute('allow', 'camera;microphone')

    this.shadowRoot.appendChild(iframe)
    this.setup(iframe, this.resolvedId, this.mode, this.namespace)
  }

  async setup(iframe, id, mode, namespace) {
    if (!iframe || this.iframe === iframe) return
    this.iframe = iframe
    this.embedding = Agent.embed({ id, mode, namespace }, iframe)

    this
      .embedding
      .on('environment', e => this.environmentProxy ? this.environmentProxy(e) : Agent.environment(e))
      .on('state', e => this.dispatchEvent(new CustomEvent('state', { detail: e })))
      .on('mutate', e => this.dispatchEvent(new CustomEvent('mutate', { detail: e })))
      .on('close', e => this.dispatchEvent(new CustomEvent('close', { detail: e })))
  }
}

customElements.define('agent-embed', AgentEmbed)
