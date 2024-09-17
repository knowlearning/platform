import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect } from "jsr:@nats-io/transport-deno@3.0.0-7"
import { jetstream, jetstreamManager } from "jsr:@nats-io/jetstream@3.0.0-9"
import environment from './environment.js'
import GenericAgent from '../index.js'
import { JSONCodec } from 'npm:nats.ws@1.29.0'

window.natsClientPromise = new Promise(async r => {
  //  TODO: remove this. it is here to delay agent connection
  //        until the auth server can spin up
  await new Promise(r => setTimeout(r, 2000))
  r(connect({
    servers: ['nats://nats:4222'],
    token: `${(await environment()).auth.user}`
  }))
})

const uuid = () => crypto.randomUUID()

//  TODO: remove necessity to make these global
window.jetstreamManagerPromise =  natsClientPromise.then(c => jetstreamManager(c))
window.jetstreamClientPromise = natsClientPromise.then(c => jetstream(c))
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
