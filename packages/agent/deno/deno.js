import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect } from "jsr:@nats-io/transport-deno@3.0.0-7"
import { jetstream, jetstreamManager } from "jsr:@nats-io/jetstream@3.0.0-9"
import environment from './environment.js'
import GenericAgent from '../index.js'
import { JSONCodec } from 'npm:@nats-io/nats-core@3.0.0-27'

globalThis.natsClientPromise = new Promise(async r => {
  //  TODO: remove this. it is here to delay agent connection
  //        until the auth server can spin up
  await new Promise(r => setTimeout(r, 2000))
  r(connect({
    servers: [Deno.env.get('NATS_CLUSTER_HOST') || 'nats://localhost:4222/'],
    token: `${(await environment()).auth.user}`
  }))
})

const uuid = () => crypto.randomUUID()

//  TODO: remove necessity to make these global
globalThis.jetstreamManagerPromise =  natsClientPromise.then(c => jetstreamManager(c))
globalThis.jetstreamClientPromise = natsClientPromise.then(c => jetstream(c))
globalThis.JSONCodec = JSONCodec
globalThis.HOST = 'core'
globalThis.isUUID = isUUID
globalThis.uuid = uuid
globalThis.PatchProxy = PatchProxy
globalThis.applyPatch = fastJSONPatch.applyPatch
globalThis.standardJSONPatch = standardJSONPatch
globalThis.environment = environment
globalThis.SESSION_ID = uuid()

export default {
  ...GenericAgent,
  environment,
  uuid
}
