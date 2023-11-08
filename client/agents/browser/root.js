import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic/index.js'

const DEVELOPMENT_HOST = 'localhost:32001'
const REMOTE_HOST = 'api.knowlearning.systems'

function isLocal() { return localStorage.getItem('api') === 'local' }

export default options => {
  const { host, protocol } = window.location

  const agent = GenericAgent({
    host: isLocal() ? DEVELOPMENT_HOST : REMOTE_HOST,
    protocol: protocol === 'https:' ? 'wss' : 'ws',
    token: options.getToken || getToken,
    WebSocket,
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
