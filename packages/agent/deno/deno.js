import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect, JSONCodec } from 'npm:nats.ws@1.29.0'
import environment from './environment.js'
import GenericAgent from '../index.js'

window.natsClientPromise = new Promise(async r => {
  //  TODO: remove this. it is here to delay agent connection
  //        until the auth server can spin up
  await new Promise(r => setTimeout(r, 1000))
  r(connect({
    servers: ['ws://nats-server:8080'],
    token: `${(await environment()).auth.user}`
  }))
})

const uuid = () => crypto.randomUUID()

//  TODO: remove necessity to make these global
window.jetstreamManagerPromise =  natsClientPromise.then(c => c.jetstreamManager())
window.jetstreamClientPromise = natsClientPromise.then(c => c.jetstream())
window.JSONCodec = JSONCodec
window.HOST = 'core'
window.isUUID = isUUID
window.uuid = uuid
window.PatchProxy = PatchProxy
window.applyPatch = fastJSONPatch.applyPatch
window.standardJSONPatch = standardJSONPatch
window.environment = environment
window.SESSION_ID = uuid()

export default {
  ...GenericAgent,
  environment,
  uuid
}
