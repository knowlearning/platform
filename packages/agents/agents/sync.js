import { compare, applyPatch } from 'fast-json-patch/index.mjs'

export default function sync(state, target) {
  const patch = compare(state, target)
  applyPatch(state, patch, true, true)
  return { patch }
}
