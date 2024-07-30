import { v4 as uuid } from 'uuid'
import { login, logout } from './authentication.js'
import { state, watch, interact, synced, reset } from './synchronization.js'
import { create } from './deprecated.js'
import environment from './environment.js'
import metadata from './metadata.js'
import { upload, download } from './storage.js'

export default {
  login,
  logout,
  environment,
  state,
  watch,
  interact,
  synced,
  metadata,
  reset,
  uuid,
  upload,
  download,
  create
}
