import { v4 as uuid, validate as isUUID } from 'uuid'
import PatchProxy, { standardJSONPatch } from '@knowlearning/patch-proxy'
import { applyPatch } from 'fast-json-patch'
import environment from './environment.js'
import { login, logout } from './authentication.js'
import GenericAgent from '../index.js'

//  TODO: remove necessity to make these global
window.HOST = window.location.host
window.isUUID = isUUID
window.uuid = uuid
window.PatchProxy = PatchProxy
window.applyPatch = applyPatch
window.standardJSONPatch = standardJSONPatch
window.environment = environment
window.SESSION_ID = uuid()

export default {
  ...GenericAgent,
  environment,
  login,
  logout,
  uuid
}