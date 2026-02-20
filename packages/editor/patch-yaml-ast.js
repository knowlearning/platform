// patch-yaml-ast.js
import YAML from 'yaml'
import fastJSONPatch from 'fast-json-patch'

const { validate: jsonValidate } = fastJSONPatch

export default function applyPatchToYamlAst(docOrNode, patchOps, options = {}) {
  const doc = isDocument(docOrNode) ? docOrNode : null
  let root = isDocument(docOrNode) ? docOrNode.contents : docOrNode

  // Minimal: always have a Document-backed node factory so we can create nodes
  const nodeFactory = doc || new YAML.Document()

  if (doc && root == null) {
    // if doc is empty, create a container root so path-based adds work
    const firstPath = Array.isArray(patchOps?.[0]?.path) ? patchOps[0].path : null
    const wantsSeqRoot = firstPath && firstPath.length > 0 && looksLikeIndex(firstPath[0])
    root = nodeFactory.createNode(wantsSeqRoot ? [] : {})
    doc.contents = root
  }

  if (options.validate) {
    const standardOps = patchOps.map(op => ({
      ...op,
      path: pathArrayToPointer(op.path),
      ...(op.from != null ? { from: pathArrayToPointer(op.from) } : null)
    }))
    const err = jsonValidate(standardOps)
    if (err) throw new Error(`Invalid JSON Patch: ${err.message || String(err)}`)
  }

  for (const raw of patchOps) {
    const op = normalizeOp(raw)

    if (op.op === 'add') {
      if (op.path.length === 0) {
        root = toYamlNode(nodeFactory, op.value)
        if (doc) doc.contents = root
        continue
      }

      const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: true })
      setChild(parent, key, toYamlNode(nodeFactory, op.value), { replace: false })
      continue
    }

    if (op.op === 'remove') {
      if (op.path.length === 0) {
        throw new Error('Cannot remove the root node; use replace with null if needed')
      }

      const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: false })
      removeChild(parent, key)
      continue
    }

    if (op.op === 'replace') {
      if (op.path.length === 0) {
        root = toYamlNode(nodeFactory, op.value)
        if (doc) doc.contents = root
        continue
      }

      const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: false })
      setChild(parent, key, toYamlNode(nodeFactory, op.value), { replace: true })
      continue
    }

    if (op.op === 'copy') {
      const fromNode = getNodeAtPath(root, op.from)
      if (fromNode === undefined) throw new Error(`Path does not exist (from=${JSON.stringify(op.from)})`)

      const copiedValue = YAML.isNode(fromNode) ? fromNode.toJSON() : fromNode
      const newNode = toYamlNode(nodeFactory, copiedValue)

      if (op.path.length === 0) {
        root = newNode
        if (doc) doc.contents = root
      } else {
        const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: true })
        setChild(parent, key, newNode, { replace: false })
      }

      continue
    }

    if (op.op === 'move') {
      const fromNode = getNodeAtPath(root, op.from)
      if (fromNode === undefined) throw new Error(`Path does not exist (from=${JSON.stringify(op.from)})`)

      const movedValue = YAML.isNode(fromNode) ? fromNode.toJSON() : fromNode

      // remove first (RFC6902 move semantics)
      if (op.from.length === 0) {
        root = toYamlNode(nodeFactory, null)
        if (doc) doc.contents = root
      } else {
        const { parent: fromParent, key: fromKey } = getParentAndKey(nodeFactory, root, op.from, { createParents: false })
        removeChild(fromParent, fromKey)
      }

      // then add at destination
      if (op.path.length === 0) {
        root = toYamlNode(nodeFactory, movedValue)
        if (doc) doc.contents = root
      } else {
        const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: true })
        setChild(parent, key, toYamlNode(nodeFactory, movedValue), { replace: false })
      }

      continue
    }

    if (op.op === 'test') {
      const node = getNodeAtPath(root, op.path)
      const actual = YAML.isNode(node) ? node.toJSON() : node

      if (!deepEqual(actual, op.value)) {
        throw new Error(`JSON Patch test failed at ${JSON.stringify(op.path)}`)
      }

      continue
    }

    throw new Error(`Unsupported op: ${op.op}`)
  }

  // Minimal ergonomic behavior: return Document unchanged, otherwise return (possibly replaced) root node
  return doc ? docOrNode : root
}

/* ---------------- deep equal (no Node built-ins) ---------------- */

function deepEqual(a, b) {
  if (Object.is(a, b)) return true

  // handle NaN (Object.is already handled), but keep for clarity
  if (Number.isNaN(a) && Number.isNaN(b)) return true

  // primitives / functions / symbols
  if (a === null || b === null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return false

  // Arrays
  const aIsArr = Array.isArray(a)
  const bIsArr = Array.isArray(b)
  if (aIsArr || bIsArr) {
    if (!(aIsArr && bIsArr)) return false
    if (a.length !== b.length) return false
    for (let i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false
    }
    return true
  }

  // Dates (rare, but safe)
  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  // Plain objects (treat prototype differences as unequal)
  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  // key set equality (order-independent)
  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
  }

  // deep compare values
  for (const k of aKeys) {
    if (!deepEqual(a[k], b[k])) return false
  }

  return true
}

/* ---------------- existing helpers (unchanged except toYamlNode/getParentAndKey doc arg usage) ---------------- */

function isDocument(x) {
  return x && typeof x === 'object' && 'contents' in x && typeof x.toString === 'function'
}

function normalizeOp(op) {
  if (!op || typeof op !== 'object') throw new Error('Patch operation must be an object')
  if (!Array.isArray(op.path)) throw new Error('Patch operation path must be an array')
  if ((op.op === 'move' || op.op === 'copy') && !Array.isArray(op.from)) {
    throw new Error(`${op.op} operation requires "from" as an array path`)
  }
  return op
}

function pathArrayToPointer(pathArr) {
  if (!Array.isArray(pathArr)) throw new Error('path must be an array')
  return (
    '/' +
    pathArr
      .map(seg => String(seg).replaceAll('~', '~0').replaceAll('/', '~1'))
      .join('/')
  )
}

function toYamlNode(doc, value) {
  // Minimal fix: always rely on Document#createNode (works across yaml versions)
  return doc.createNode(value)
}

function getParentAndKey(doc, root, path, { createParents }) {
  if (path.length === 0) return { parent: null, key: null }

  let node = root
  for (let i = 0; i < path.length - 1; i++) {
    const seg = path[i]
    const nextSeg = path[i + 1]
    node = getOrCreateChild(doc, node, seg, nextSeg, { createParents })
  }

  const last = path[path.length - 1]
  const key = classifyKey(node, last)
  return { parent: node, key }
}

function getNodeAtPath(root, path) {
  if (path.length === 0) return root
  let node = root
  for (const seg of path) {
    if (!YAML.isNode(node)) return undefined

    if (isMap(node)) {
      const pair = findPair(node, String(seg))
      node = pair ? pair.value : undefined
      continue
    }

    if (isSeq(node)) {
      const idx = toIndex(seg)
      node = node.items[idx]
      continue
    }

    return undefined
  }
  return node
}

function getOrCreateChild(doc, parent, seg, nextSeg, { createParents }) {
  if (!YAML.isNode(parent)) throw new Error('Invalid YAML AST: expected node while traversing')

  if (isMap(parent)) {
    const key = String(seg)
    let pair = findPair(parent, key)
    if (!pair) {
      if (!createParents) throw new Error(`Path does not exist (missing key "${key}")`)
      parent.items.push(new YAML.Pair(key, makeContainerForNext(doc, nextSeg)))
      pair = findPair(parent, key)
    }
    if (!pair) throw new Error('Internal error creating map pair')
    if (!YAML.isNode(pair.value) && createParents) pair.value = makeContainerForNext(doc, nextSeg)
    return pair.value
  }

  if (isSeq(parent)) {
    const idx = toIndex(seg)
    if (idx < 0) throw new Error(`Invalid array index: ${String(seg)}`)

    if (parent.items[idx] == null) {
      if (!createParents) throw new Error(`Path does not exist (missing index ${idx})`)
      parent.items[idx] = makeContainerForNext(doc, nextSeg)
    }
    return parent.items[idx]
  }

  throw new Error('Cannot traverse into non-collection YAML node')
}

function makeContainerForNext(doc, nextSeg) {
  return toYamlNode(doc, looksLikeIndex(nextSeg) ? [] : {})
}

function classifyKey(parent, seg) {
  if (parent == null) return null
  if (isMap(parent)) return { type: 'map', name: String(seg) }
  if (isSeq(parent)) return { type: 'seq', index: toIndex(seg) }
  throw new Error('Target parent is not a map or seq')
}

function setChild(parent, key, newNode, { replace }) {
  if (parent == null) throw new Error('Internal error: cannot setChild on null parent (root handled separately)')

  if (key.type === 'map') {
    const pair = findPair(parent, key.name)
    if (pair) pair.value = newNode
    else parent.items.push(new YAML.Pair(key.name, newNode))
    return
  }

  if (key.type === 'seq') {
    const idx = key.index
    if (idx < 0) throw new Error(`Invalid array index: ${idx}`)
    if (idx > parent.items.length) throw new Error(`Index ${idx} out of bounds (len=${parent.items.length})`)

    if (replace) parent.items[idx] = newNode
    else parent.items.splice(idx, 0, newNode)
    return
  }

  throw new Error('Unknown key type')
}

function removeChild(parent, key) {
  if (parent == null) throw new Error('Internal error: cannot remove root here')

  if (key.type === 'map') {
    const i = parent.items.findIndex(p => isPairWithKey(p, key.name))
    if (i === -1) throw new Error(`Cannot remove missing key "${key.name}"`)
    parent.items.splice(i, 1)
    return
  }

  if (key.type === 'seq') {
    const idx = key.index
    if (idx < 0 || idx >= parent.items.length) throw new Error(`Cannot remove missing index ${idx}`)
    parent.items.splice(idx, 1)
    return
  }

  throw new Error('Unknown key type')
}

function isMap(node) {
  return node && node.constructor && node.constructor.name === 'YAMLMap'
}

function isSeq(node) {
  return node && node.constructor && node.constructor.name === 'YAMLSeq'
}

function findPair(mapNode, keyName) {
  return mapNode.items.find(p => isPairWithKey(p, keyName))
}

function isPairWithKey(pair, keyName) {
  if (!pair || pair.constructor?.name !== 'Pair') return false
  const k = pair.key
  if (YAML.isScalar(k)) return String(k.value) === keyName
  return String(k?.toJSON?.() ?? k) === keyName
}

function looksLikeIndex(seg) {
  return /^[0-9]+$/.test(String(seg))
}

function toIndex(seg) {
  const s = String(seg)
  if (!/^[0-9]+$/.test(s)) throw new Error(`Expected numeric index segment, got "${s}"`)
  const n = Number(s)
  if (!Number.isSafeInteger(n)) throw new Error(`Unsafe index: "${s}"`)
  return n
}