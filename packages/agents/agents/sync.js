import { compare, applyPatch } from 'fast-json-patch'

export default function sync(state, target) {
  const patch = compare(state, target)
  applyPatch(state, patch, true, true)
  return { patch }
}