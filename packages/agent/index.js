import { state, watch, metadata, interact, synced, reset } from './synchronization.js'
import { create } from './deprecated.js'
import { upload, download } from './storage.js'
import { claim, configure } from './admin.js'
import { query } from './session.js'

export default {
  state,
  query,
  watch,
  interact,
  synced,
  reset,
  create,
  metadata,
  upload,
  download,
  claim
}
