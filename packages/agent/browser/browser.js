import { v4 as uuid, validate as isUUID } from 'uuid'
import PatchProxy, { standardJSONPatch } from '@knowlearning/patch-proxy'
import { applyPatch } from 'fast-json-patch'
import { login, logout } from './authentication.js'
import GenericAgent from '../index.js'
import EmbeddedAgent from './embedded-agent.js'
import { wsconnect, JSONCodec } from '@nats-io/nats-core'
import { jetstream, jetstreamManager } from "@nats-io/jetstream"
import embed from './embed.js'

const CLUSTER_HOST = window.NATS_WS_CLUSTER_HOST || 'ws://localhost:8080/'
const AUTH_HOST = window.CORE_AUTH_HOST || 'http://localhost:8765/'

const servers = [CLUSTER_HOST]
const token = crypto.randomUUID().replaceAll('-', '')
const code = localStorage.getItem('AGENT_AUTH_CODE')

let resolveUserId
const userIdPromise = new Promise(r => resolveUserId = r)

fetch(AUTH_HOST, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  credentials: 'include',
  body: JSON.stringify({ token, code })
})
  .then(response => resolveUserId(response.text()))
  .catch(error => console.warn('ERROR Authenticating User', error))

window.natsClientPromise = wsconnect({ servers, token })
localStorage.removeItem('AGENT_AUTH_CODE')

//  TODO: remove necessity to make these global
window.jetstreamManagerPromise =  natsClientPromise.then(c => jetstreamManager(c))
window.jetstreamClientPromise = natsClientPromise.then(c => jetstream(c))

window.JSONCodec = JSONCodec
window.HOST = window.location.host
window.isUUID = isUUID
window.uuid = uuid
window.PatchProxy = PatchProxy
window.applyPatch = applyPatch
window.standardJSONPatch = standardJSONPatch
window.environment = environment
window.SESSION_ID = uuid()


let embedded

try { embedded = window.self !== window.top }
catch (e) { embedded = true }

const baseAgent = embedded ? EmbeddedAgent() : GenericAgent

//  TODO: implement
async function environment() {
  return {
    auth: { user: await userIdPromise },
    domain: window.location.host
  }
}

export default {
  environment,
  ...baseAgent,
  login,
  logout,
  embed,
  uuid
}
