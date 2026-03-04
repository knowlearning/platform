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

  // Capture "before" text for edit computation (doc-only)
  const beforeText = doc ? getDocSourceText(doc) : null

  // Track which paths were touched (for update extraction)
  const touched = []
  const touch = (op) => {
    const o = normalizeOp(op)
    touched.push({
      op: o.op,
      path: o.path,
      from: o.from
    })
  }

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
    touch(raw)
    const op = normalizeOp(raw)

    if (op.op === 'add') {
      if (op.path.length === 0) {
        const oldRoot = root
        const newRoot = toYamlNode(nodeFactory, op.value)
        preservePresentation(oldRoot, newRoot)
        root = newRoot
        if (doc) replaceDocRoot(doc, oldRoot, root)
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
        const oldRoot = root
        const newRoot = toYamlNode(nodeFactory, op.value)
        preservePresentation(oldRoot, newRoot)
        root = newRoot
        if (doc) replaceDocRoot(doc, oldRoot, root)
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
        const oldRoot = root
        preservePresentation(oldRoot, newNode)
        root = newNode
        if (doc) replaceDocRoot(doc, oldRoot, root)
      } else {
        const { parent, key } = getParentAndKey(nodeFactory, root, op.path, { createParents: true })
        setChild(parent, key, newNode, { replace: false })
      }

      continue
    }

    if (op.op === 'move') {
      // RFC6902: moving to the same location is a no-op
      if (Array.isArray(op.from) && Array.isArray(op.path) && samePath(op.from, op.path)) {
        continue
      }

      const fromNode = getNodeAtPath(root, op.from)
      if (fromNode === undefined) throw new Error(`Path does not exist (from=${JSON.stringify(op.from)})`)

      const movedValue = YAML.isNode(fromNode) ? fromNode.toJSON() : fromNode

      // Remove first (RFC6902 move semantics)
      if (op.from.length === 0) {
        const oldRoot = root
        root = toYamlNode(nodeFactory, null)
        if (doc) replaceDocRoot(doc, oldRoot, root)
      } else {
        const { parent: fromParent, key: fromKey } = getParentAndKey(nodeFactory, root, op.from, { createParents: false })
        removeChild(fromParent, fromKey)
      }

      // Then add at destination
      if (op.path.length === 0) {
        const oldRoot = root
        const newRoot = toYamlNode(nodeFactory, movedValue)
        preservePresentation(oldRoot, newRoot)
        root = newRoot
        if (doc) replaceDocRoot(doc, oldRoot, root)
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

  // ---- compute doc edits from AST ranges (no full string diff) ----
  const afterText = doc ? doc.toString() : null
  const updates = doc
    ? buildYamlEditsFromTouchedPaths({
        beforeText,
        afterText,
        beforeDoc: parseForRanges(beforeText),
        afterDoc: parseForRanges(afterText),
        touched
      })
    : []

  // Return BOTH the patched value and the edits
  return {
    value: doc ? docOrNode : root,
    updates,
    before: beforeText,
    after: afterText
  }
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

function samePath(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (String(a[i]) !== String(b[i])) return false
  }
  return true
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

    // Avoid sparse sequences: materialize gaps with explicit null scalars
    if (idx >= parent.items.length) {
      if (!createParents) throw new Error(`Path does not exist (missing index ${idx})`)
      while (parent.items.length < idx) parent.items.push(toYamlNode(doc, null))
      parent.items.push(makeContainerForNext(doc, nextSeg))
      return parent.items[idx]
    }

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
      if (replace) throw new Error(`Path does not exist (missing key "${key.name}")`)
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
    const i = parent.items.findIndex(p => YAML.isPair(p) && keyToString(p.key) === key.name)
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

/* ---- yaml type guards (don’t use constructor.name) ---- */

function isMap(node) {
  return YAML.isMap(node)
}

function isSeq(node) {
  return YAML.isSeq(node)
}

function findPair(mapNode, keyName) {
  return mapNode.items.find(p => YAML.isPair(p) && keyToString(p.key) === keyName)
}

function keyToString(k) {
  if (YAML.isScalar(k)) return String(k.value)
  return String(k?.toJSON?.() ?? k)
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
    Object.defineProperty(doc, '__rt_originalToString', { value: original, configurable: true })

    doc.toString = (...args) => {
      let out = original(...args)

      // If we snapshotted an original top comment header and the emitter omitted it,
      // prefix it back exactly once
      const top = doc.__rt_topPrefix || ''
      if (top && !out.startsWith(top)) out = top + out

      return postProcessYamlOutput(out)
    }

    Object.defineProperty(doc, '__patched_toString', { value: true })
  }
}

function replaceDocRoot(doc, oldRoot, newRoot) {
  if (!doc) return

  // Snapshot the original leading comment/header from the *pre-swap* rendered YAML.
  // This is the only representation that's reliably available across yaml versions.
  if (!doc.__rt_topPrefix) {
    const originalToString = doc.__rt_originalToString || doc.toString.bind(doc)
    const before = originalToString()
    const header = extractLeadingCommentBlock(before)
    if (header) {
      try {
        doc.__rt_topPrefix = header
      } catch {}
    }
  }

  doc.contents = newRoot

  // Still keep AST-level presentation when it exists (harmless, sometimes helpful)
  preservePresentation(oldRoot, newRoot)
}

function extractLeadingCommentBlock(yamlText) {
  const lines = String(yamlText).replace(/\r\n/g, '\n').split('\n')
  const out = []

  let i = 0
  while (i < lines.length) {
    const line = lines[i]

    // keep initial blank lines (rare, but safe)
    if (line.trim() === '') {
      out.push(line)
      i++
      continue
    }

    // keep contiguous leading comment lines
    if (/^\s*#/.test(line)) {
      out.push(line)
      i++
      continue
    }

    break
  }

  // If we captured only blanks, ignore
  if (!out.some(l => /^\s*#/.test(l))) return ''

  return out.join('\n') + '\n'
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

/* ---------------- updates builder (AST ranges, not string diff) ---------------- */

function getDocSourceText(doc) {
  const original = doc.__rt_originalToString || doc.toString.bind(doc)
  return original()
}

function parseForRanges(text) {
  return YAML.parseDocument(String(text || ''), {
    strict: true,
    keepCstNodes: true,
    keepNodeTypes: true,
    keepSourceTokens: true
  })
}

function nodeSpan(node) {
  const r = node?.cstNode?.range || node?.range
  if (!Array.isArray(r) || r.length < 2) return null
  const start = r[0]
  const end = r[1]
  if (!Number.isFinite(start) || !Number.isFinite(end)) return null
  return { start, end }
}

function pairSpan(pair) {
  const r = pair?.cstNode?.range || pair?.value?.cstNode?.range || pair?.value?.range
  if (!Array.isArray(r) || r.length < 2) return null
  return { start: r[0], end: r[1] }
}

function getPairAtPath(doc, path) {
  if (path.length === 0) return null
  const parentPath = path.slice(0, -1)
  const seg = String(path[path.length - 1])
  const parent = getNodeAtPath(doc.contents, parentPath)
  if (!YAML.isNode(parent) || !YAML.isMap(parent)) return null
  return findPair(parent, seg) || null
}

function getItemAtPath(doc, path) {
  if (path.length === 0) return null
  const parentPath = path.slice(0, -1)
  const idxSeg = path[path.length - 1]
  const parent = getNodeAtPath(doc.contents, parentPath)
  if (!YAML.isNode(parent) || !YAML.isSeq(parent)) return null
  const idx = toIndex(idxSeg)
  return parent.items[idx] ?? null
}

function getEditTargetSpan(doc, path) {
  if (path.length === 0) {
    // root: best effort is whole document
    return { start: 0, end: (doc?.toString?.() || '').length }
  }

  const parentPath = path.slice(0, -1)
  const parent = getNodeAtPath(doc.contents, parentPath)

  if (YAML.isMap(parent)) {
    const pair = getPairAtPath(doc, path)
    const sp = pair ? pairSpan(pair) : null
    return sp
  }

  if (YAML.isSeq(parent)) {
    const item = getItemAtPath(doc, path)
    const sp = item ? nodeSpan(item) : null
    return sp
  }

  return null
}

function inferInsertionPoint(beforeDoc, path) {
  // For adds where there was no span in beforeDoc: insert relative to siblings/parent
  if (path.length === 0) return 0
  const parentPath = path.slice(0, -1)
  const parent = getNodeAtPath(beforeDoc.contents, parentPath)
  const parentSpan = nodeSpan(parent)
  if (!parentSpan) return 0

  const last = path[path.length - 1]

  if (YAML.isSeq(parent)) {
    const idx = toIndex(last)
    // If inserting before an existing item, insert at that item's start
    if (idx < parent.items.length) {
      const sp = nodeSpan(parent.items[idx])
      if (sp) return sp.start
    }
    // Else append at end of last item (or parent end)
    const prev = parent.items[parent.items.length - 1]
    const prevSp = nodeSpan(prev)
    return prevSp ? prevSp.end : parentSpan.end
  }

  if (YAML.isMap(parent)) {
    // Map order is not stable; safest is append at end of map span
    return parentSpan.end
  }

  return parentSpan.end
}

function buildYamlEditsFromTouchedPaths({ beforeText, afterText, beforeDoc, afterDoc, touched }) {
  const edits = []
  if (beforeText == null || afterText == null) return edits

  // Coalesce touched paths (prefer deeper paths first)
  const uniq = new Map()
  for (const t of touched) {
    const k = JSON.stringify({ op: t.op, path: t.path, from: t.from })
    if (!uniq.has(k)) uniq.set(k, t)
  }
  const ops = Array.from(uniq.values()).sort((a, b) => b.path.length - a.path.length)

  for (const t of ops) {
    const path = t.path

    // Determine old span (what to replace) and new span (what to insert)
    let oldSpan = getEditTargetSpan(beforeDoc, path)
    let newSpan = getEditTargetSpan(afterDoc, path)

    // removals: newSpan will be null
    // adds: oldSpan will be null
    if (!oldSpan && t.op === 'add') {
      const at = inferInsertionPoint(beforeDoc, path)
      oldSpan = { start: at, end: at }
    }

    // If we still can't localize, fall back to whole-doc replace (rare)
    if (!oldSpan) {
      edits.push({ from: 0, to: beforeText.length, insert: afterText })
      continue
    }

    const insert = newSpan ? afterText.slice(newSpan.start, newSpan.end) : ''

    edits.push({
      from: oldSpan.start,
      to: oldSpan.end,
      insert,
      path
    })
  }

  // Sort edits descending by `from` so consumers can apply without offset juggling
  edits.sort((a, b) => b.from - a.from)

  return edits
}