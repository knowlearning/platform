import fastJSONPatch from 'fast-json-patch'
import { standardJSONPatch } from '../utils.js'

export function applyPatch(object, patch) {
    return fastJSONPatch.applyPatch(object, standardJSONPatch(patch)).newDocument
}
