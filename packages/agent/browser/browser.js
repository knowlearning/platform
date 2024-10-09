import { v4 as uuid, validate as isUUID } from 'uuid'
import PatchProxy, { standardJSONPatch } from '@knowlearning/patch-proxy'
import { applyPatch } from 'fast-json-patch'
import environment from './environment.js'
import { login, logout } from './authentication.js'
import GenericAgent from '../index.js'
import EmbeddedAgent from './embedded-agent.js'
import { connect, JSONCodec } from 'nats.ws'
import embed from './embed.js'

window.natsClientPromise = connect({
  servers: [window.NATS_WS_CLUSTER_HOST || 'ws://localhost:8080/' ],
  token: 'me'
})

//  TODO: remove necessity to make these global
window.jetstreamManagerPromise =  natsClientPromise.then(c => c.jetstreamManager())
window.jetstreamClientPromise = natsClientPromise.then(c => c.jetstream())
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

export default {
  environment,
  ...baseAgent,
  login,
  logout,
  embed,
  uuid
}
