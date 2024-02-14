import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'

const DEVELOPMENT_HOST = 'localhost:32001'
const REMOTE_HOST = 'api.knowlearning.systems'

function isLocal() { return localStorage.getItem('api') === 'local' }

export default options => {
  const { host, protocol } = window.location

  const Connection = function () {
    const ws = new WebSocket(`${protocol === 'https:' ? 'wss' : 'ws'}://${isLocal() ? DEVELOPMENT_HOST : REMOTE_HOST}`)

    this.send = message => ws.send(JSON.stringify(message))
    this.close = () => ws.close()

    ws.onopen = () => this.onopen()
    ws.onmessage = ({ data }) => this.onmessage(data)
    ws.onerror = error => this.onerror && this.onerror(error)
    ws.onclose = error => this.onclose && this.onclose(error)

    return this
  }

  const agent = GenericAgent({
    token: options.getToken || getToken,
    Connection,
    uuid,
    fetch,
    applyPatch,
    login,
    logout,
    reboot: () => window.location.reload()
  })

  agent.local = () => {
    if (isLocal()) return

    localStorage.setItem('api', 'local')
    location.reload()
  }
  agent.remote = () => {
    if (!isLocal()) return

    localStorage.removeItem('api')
    location.reload()
  }
  agent.close = () => {
    window.close()
  }

  return agent
}
