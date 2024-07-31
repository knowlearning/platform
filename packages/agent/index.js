import { state, watch, interact, synced, reset } from './synchronization.js'
import { create } from './deprecated.js'
import metadata from './metadata.js'
import { upload, download } from './storage.js'
import { claim, configure } from './admin.js'

export default {
  state,
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
