import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'

const SECURE = window.location.protocol === 'https:'
const DEVELOPMENT_HOST = `localhost:3200${ SECURE ? '1' : '2' }`
const REMOTE_HOST = localStorage.getItem('mode') === 'staging' ? 'api.staging.knowlearning.systems' : 'api.knowlearning.systems'

function isLocal() { return localStorage.getItem('api') === 'local' }

const API_HOST = isLocal() ? DEVELOPMENT_HOST : REMOTE_HOST

//  TODO: remove this hack when we can set sid cookie through websocket handshake
fetch(`http${ SECURE ? 's' : '' }://${API_HOST}/_sid-check`, { method: 'GET', credentials: 'include' })
  .then(response => response.status === 201 && location.reload())

export default options => {
  const { host } = window.location

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
