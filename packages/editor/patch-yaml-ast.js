// patch-yaml-ast.js
import YAML from 'yaml'
import fastJSONPatch from 'fast-json-patch'

const { validate: jsonValidate } = fastJSONPatch

export default function applyPatchToYamlAst(docOrNode, patchOps, options = {}) {
  const doc = isDocument(docOrNode) ? docOrNode : null
  let root = isDocument(docOrNode) ? docOrNode.contents : docOrNode

  // Always have a Document-backed node factory so we can create nodes
  const nodeFactory = doc || new YAML.Document()

  // Configure emitter / toString for strict round-trip formatting
  configureDocForRoundTrip(nodeFactory)

  if (doc && root == null) {
    // If doc is empty, create a container root so path-based adds work
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
        const newRoot = toYamlNode(nodeFactory, op.value)
        preservePresentation(root, newRoot)
        root = newRoot
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
        const newRoot = toYamlNode(nodeFactory, op.value)
        preservePresentation(root, newRoot)
        root = newRoot
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
        preservePresentation(root, newNode)
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

      // Remove first (RFC6902 move semantics)
      if (op.from.length === 0) {
        root = toYamlNode(nodeFactory, null)
        if (doc) doc.contents = root
      } else {
        const { parent: fromParent, key: fromKey } = getParentAndKey(nodeFactory, root, op.from, { createParents: false })
        removeChild(fromParent, fromKey)
      }

      // Then add at destination
      if (op.path.length === 0) {
        const newRoot = toYamlNode(nodeFactory, movedValue)
        preservePresentation(root, newRoot)
        root = newRoot
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

  return doc ? docOrNode : root
}

/* ---------------- deep equal (no Node built-ins) ---------------- */

function deepEqual(a, b) {
  if (Object.is(a, b)) return true
  if (Number.isNaN(a) && Number.isNaN(b)) return true

  if (a === null || b === null) return a === b
  if (typeof a !== 'object' || typeof b !== 'object') return false

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

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  if (Object.getPrototypeOf(a) !== Object.getPrototypeOf(b)) return false

  const aKeys = Object.keys(a)
  const bKeys = Object.keys(b)
  if (aKeys.length !== bKeys.length) return false

  for (const k of aKeys) {
    if (!Object.prototype.hasOwnProperty.call(b, k)) return false
  }

  for (const k of aKeys) {
    if (!deepEqual(a[k], b[k])) return false
  }

  return true
}

/* ---------------- helpers ---------------- */

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
    if (pair) {
      const oldValue = pair.value

      // Preserve folded/literal block header/chomping by mutating in place
      if (replace && YAML.isScalar(oldValue) && YAML.isScalar(newNode) && isBlockScalar(oldValue)) {
        oldValue.value = normalizeReplacedBlockScalarValue(oldValue, newNode.value)
        return
      }

      pair.value = newNode
      preservePresentation(oldValue, newNode)

      if (YAML.isScalar(oldValue) && YAML.isScalar(newNode)) {
        normalizeScalarValueForPreservedStyle(oldValue, newNode)
      }
    } else {
      parent.items.push(new YAML.Pair(key.name, newNode))
    }
    return
  }

  if (key.type === 'seq') {
    const idx = key.index
    if (idx < 0) throw new Error(`Invalid array index: ${idx}`)
    if (idx > parent.items.length) throw new Error(`Index ${idx} out of bounds (len=${parent.items.length})`)

    if (replace) {
      const oldValue = parent.items[idx]

      if (YAML.isScalar(oldValue) && YAML.isScalar(newNode) && isBlockScalar(oldValue)) {
        oldValue.value = normalizeReplacedBlockScalarValue(oldValue, newNode.value)
        return
      }

      parent.items[idx] = newNode
      preservePresentation(oldValue, newNode)
      if (YAML.isScalar(oldValue) && YAML.isScalar(newNode)) {
        normalizeScalarValueForPreservedStyle(oldValue, newNode)
      }
    } else {
      parent.items.splice(idx, 0, newNode)
    }
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

/* ---------------- strict roundtrip / presentation preservation ---------------- */

function configureDocForRoundTrip(doc) {
  const opts = doc?.options
  if (opts && typeof opts === 'object') {
    if (opts.keepCstNodes == null) opts.keepCstNodes = true
    if (opts.keepNodeTypes == null) opts.keepNodeTypes = true
    if (opts.keepSourceTokens == null) opts.keepSourceTokens = true
    if (opts.lineWidth == null) opts.lineWidth = 0
  }

  if (isDocument(doc) && !doc.__patched_toString) {
    const original = doc.toString.bind(doc)
    doc.toString = (...args) => {
      const out = original(...args)
      return postProcessYamlOutput(out)
    }
    Object.defineProperty(doc, '__patched_toString', { value: true })
  }
}

function postProcessYamlOutput(yamlText) {
  // 1) Flow collection inner padding: [ 1, 2 ] -> [1, 2]
  let out = yamlText.replace(/\[\s+([^\]\n]*?)\s+\]/g, '[$1]')

  // 2) Folded blocks occasionally get re-emitted as a single long line
  out = fixCollapsedFoldedBlocks(out)

  // 3) Collapse whitespace-only “paragraph gap” lines inside folded blocks
  out = fixFoldedBlockParagraphGaps(out)

  // 4) Ensure final newline
  out = ensureTrailingNewline(out)

  return out
}

function ensureTrailingNewline(s) {
  return s.endsWith('\n') ? s : s + '\n'
}

function fixCollapsedFoldedBlocks(yamlText) {
  const lines = yamlText.split('\n')
  const out = []
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)

    // Match folded header
    const m = line.match(/^(\s*[^:#]+:\s*>-?)\s*(#.*)?$/)
    if (!m) continue

    const next = lines[i + 1]
    const after = lines[i + 2]
    if (next == null) continue
    if (!/^\s+/.test(next)) continue
    if (after != null && /^\s+/.test(after) && after.trim() !== '') continue

    const indentMatch = next.match(/^(\s+)(.*)$/)
    if (!indentMatch) continue
    const indent = indentMatch[1]
    const content = indentMatch[2]

    if (content.length <= 20) continue
    const sp = content.indexOf(' ')
    if (sp === -1) continue

    const left = content.slice(0, sp)
    const right = content.slice(sp + 1)

    out.pop()
    out.push(line)
    out.push(indent + left)
    out.push(indent + right)

    i += 1
  }

  return out.join('\n')
}

function fixFoldedBlockParagraphGaps(yamlText) {
  const lines = yamlText.split('\n')
  const out = []

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    out.push(line)

    // Folded header only: >, >-, >+
    const m = line.match(/^(\s*[^:#]+:\s*>\+?-?)\s*(#.*)?$/)
    if (!m) continue

    const first = lines[i + 1]
    if (first == null || !/^\s+/.test(first)) continue
    const indent = (first.match(/^(\s+)/) || [])[1] || ''

    const start = i + 1
    let j = start
    while (j < lines.length) {
      const l = lines[j]
      // whitespace-only lines are valid inside blocks; keep scanning
      if (/^\s*$/.test(l)) {
        j++
        continue
      }
      // stop on dedent / non-content
      if (!l.startsWith(indent)) break
      j++
    }

    const block = lines.slice(start, j)

    // Drop whitespace-only lines only when they’re between two content lines
    const cleaned = []
    for (let k = 0; k < block.length; k++) {
      const cur = block[k]
      const curIsBlank = /^\s*$/.test(cur)

      if (!curIsBlank) {
        cleaned.push(cur)
        continue
      }

      const prev = cleaned.length ? cleaned[cleaned.length - 1] : null

      let next = null
      for (let t = k + 1; t < block.length; t++) {
        if (!/^\s*$/.test(block[t])) {
          next = block[t]
          break
        }
      }

      const prevIsContent = prev != null && prev.startsWith(indent) && prev.trim() !== ''
      const nextIsContent = next != null && next.startsWith(indent) && next.trim() !== ''

      // between two content lines → drop
      if (prevIsContent && nextIsContent) continue

      // otherwise keep (conservative)
      cleaned.push(cur)
    }

    out.splice(out.length - 1, 1)
    out.push(line)
    for (const l of cleaned) out.push(l)

    i = j - 1
  }

  return out.join('\n')
}

function preservePresentation(oldNode, newNode) {
  if (!YAML.isNode(oldNode) || !YAML.isNode(newNode)) return

  copyIfPresent(newNode, oldNode, 'commentBefore')
  copyIfPresent(newNode, oldNode, 'comment')
  copyIfPresent(newNode, oldNode, 'spaceBefore')

  copyIfPresent(newNode, oldNode, 'anchor')
  copyIfPresent(newNode, oldNode, 'tag')

  if (YAML.isScalar(oldNode) && YAML.isScalar(newNode)) {
    copyIfPresent(newNode, oldNode, 'type')
    copyIfPresent(newNode, oldNode, 'blockIndent')
    copyIfPresent(newNode, oldNode, 'format')
  }
}

function normalizeScalarValueForPreservedStyle(oldScalar, newScalar) {
  const oldType = String(oldScalar.type || '')
  const isFolded = oldType.toUpperCase().includes('FOLDED') || oldType === 'BLOCK_FOLDED'
  const isLiteral = oldType.toUpperCase().includes('LITERAL') || oldType === 'BLOCK_LITERAL'
  if (!isFolded && !isLiteral) return
  if (typeof newScalar.value !== 'string') return

  const s = newScalar.value.replace(/\r\n/g, '\n')

  if (isFolded) {
    newScalar.value = s.replace(/\n{2,}/g, '\n').replace(/\n+$/, '')
    return
  }

  if (isLiteral) {
    newScalar.value = s.replace(/\n+$/, '')
  }
}

function isBlockScalar(scalar) {
  if (!YAML.isScalar(scalar)) return false
  const t = String(scalar.type || '').toUpperCase()
  return t.includes('BLOCK_FOLDED') || t.includes('BLOCK_LITERAL') || t.includes('FOLDED') || t.includes('LITERAL')
}

function normalizeReplacedBlockScalarValue(oldScalar, nextValue) {
  if (typeof nextValue !== 'string') return nextValue
  return nextValue.replace(/\r\n/g, '\n').replace(/\n+$/, '')
}

function copyIfPresent(dst, src, key) {
  if (!dst || !src) return
  if (!(key in src)) return
  try {
    dst[key] = src[key]
  } catch {
    // ignore readonly properties across yaml versions
  }
}