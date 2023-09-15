import { v1 as uuid } from 'uuid'
import { applyPatch } from 'fast-json-patch'
import { getToken, login, logout } from './auth.js'
import GenericAgent from '../generic.js'

const DEVELOPMENT_HOST = 'localhost:32001'
const REMOTE_HOST = 'api.knowlearning.systems'

function isLocal() { return localStorage.getItem('api') === 'local' }

export default () => {
  const { host, protocol } = window.location

  const agent = GenericAgent({
    host: isLocal() ? DEVELOPMENT_HOST : REMOTE_HOST,
    protocol: protocol === 'https:' ? 'wss' : 'ws',
    token: getToken,
    WebSocket,
    uuid,
    fetch,
    applyPatch,
    login,
    logout,
    reboot: () => window.location.reload()
  })

  const { state } = agent
  //  TODO: remove agent.state proxy here as part of "get rid of default scope" work
  agent.state = (scope=host,user,domain) => state(scope, user, domain)
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

  return agent
}
