import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'

const TEST_DOMAIN = 'tests.knowlearning.systems'
const LANGUAGES = [...navigator.languages]

const API_HOST = localStorage.getItem('API_HOST') || 'api.knowlearning.systems'
//  const API_HOST = 'api-test.knowlearning.systems'
//  const API_HOST = 'localhost:8765'

//  TODO: remove this hack when we can set partitioned sid cookie through websocket handshake
//        deno is partly in the way on teh set side, and browser support is in the way for
//        the client side.
async function ensureSidEstablished() {
  const response = await fetch(`https://${API_HOST}/_sid-check`, { method: 'GET', credentials: 'include' })
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

    const ws = new WebSocket(`wss://${API_HOST}`)

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
    variables: { LANGUAGES },
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
