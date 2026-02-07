import PatchProxy from '../index.js'
import { applyPatch } from './utils.js'

export function makeState(initial = {}, opts = {}) {
  const patches = []

  const state = new PatchProxy(
    initial,
    patch => patches.push(patch),
    opts.ephemeralPaths || {},
    opts.parentPath || [],
    opts.rootState
  )

  return {
    state,
    patches,
    apply() {
      return applyPatch({}, patches.flat())
    }
  }
}
