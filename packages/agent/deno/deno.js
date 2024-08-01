import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import * as fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect, JSONCodec } from 'npm:nats.ws@1.29.0'
import environment from './environment.js'
import GenericAgent from '../index.js'

const uuid = () => crypto.randomUUID()

//  TODO: remove necessity to make these global
window.connectNATS = connect
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
