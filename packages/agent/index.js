import { v4 as uuid } from 'uuid'
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
  uuid,
  create
}
