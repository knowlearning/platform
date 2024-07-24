import { login, logout } from './authentication.js'
import { state, watch, synced, reset } from './synchronization.js'
import { create } from './deprecated.js'
import environment from './environment.js'

export default {
  login,
  logout,
  environment,
  state,
  watch,
  synced,
  reset,
  create
}
