import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'

const TEST_DOMAIN = 'tests.knowlearning.systems'
const SECURE = window.location.protocol === 'https:'
const DEVELOPMENT_HOST = `localhost:3200${ SECURE ? '1' : '2' }`
const ENVIRONMENT_API_HOST = localStorage.getItem('API_HOST')
const REMOTE_HOST = window.location.hostname === TEST_DOMAIN && ENVIRONMENT_API_HOST ? ENVIRONMENT_API_HOST : 'api.knowlearning.systems'

function isLocal() { return localStorage.getItem('api') === 'local' }

const API_HOST = isLocal() ? DEVELOPMENT_HOST : REMOTE_HOST

//  TODO: remove this hack when we can set partitioned sid cookie through websocket handshake
//        deno is partly in the way on teh set side, and browser support is in the way for
//        the client side.
async function ensureSidEstablished() {
  const response = await fetch(`http${ SECURE ? 's' : '' }://${API_HOST}/_sid-check`, { method: 'GET', credentials: 'include' })
  const hasLocalStorageSID = !!localStorage.getItem('sid')
  if (response.status === 201) {
    if (!hasLocalStorageSID) {
      const sentSid = await response.text()
      localStorage.setItem('sid', sentSid)
      location.reload()
    }
  }
  else if (response.status === 200) {
    //  if we reach here, assumably the server has seen an sid cookie
    if (hasLocalStorageSID) {
      localStorage.removeItem('sid')
      location.reload()
    }
  }
  else {
    console.warn('Issue Connecting To the API Server')
  }
}

export default options => {
  ensureSidEstablished()
  const Connection = function () {

    const ws = new WebSocket(`ws${ SECURE ? 's' : '' }://${API_HOST}`)

    this.send = message => ws.send(JSON.stringify(message))
    this.close = info => {
      this.send({ type: 'close', info })
      ws.close()
    }

    ws.onopen = () => this.onopen()
    ws.onmessage = ({ data }) => this.onmessage(data.length === 0 ? null : JSON.parse(data))
    ws.onerror = error => this.onerror && this.onerror(error)
    ws.onclose = error => this.onclose && this.onclose(error)

    return this
  }

  const agent = GenericAgent({
    token: options.getToken || getToken,
    sid: () => localStorage.getItem('sid'),
    domain: window.location.host,
    Connection,
    uuid,
    fetch,
    applyPatch,
    login,
    logout,
    reboot: () => window.location.reload()
  })

  agent.local = () => {
    localStorage.setItem('api', 'local')
    location.reload()
  }
  agent.remote = (mode='production') => {
    localStorage.setItem('api', 'remote')
    localStorage.setItem('mode', mode)
    location.reload()
  }
  agent.close = () => {
    window.close()
  }

  return agent
}
