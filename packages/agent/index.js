import { login, logout } from './authentication.js'
import { state, watch, synced } from './synchronization.js'
import environment from './environment.js'

export default {
  login,
  logout,
  environment,
  state,
  watch,
  synced
}
