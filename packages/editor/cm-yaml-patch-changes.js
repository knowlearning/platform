// DFS through the CodeMirror YAML syntax tree to locate and apply patch operations
import YAML from 'yaml'
import { EditorState } from '@codemirror/state'
import { ensureSyntaxTree } from '@codemirror/language'
import { yaml } from '@codemirror/lang-yaml'

function isDocMarkerNode(node, docText) {
  if (!node) return false
  const name = node.name || ''
  if (
    name === 'DocumentStart' ||
    name === 'DocStart' ||
    name === 'DocumentMarker' ||
    name === 'DocMarker'
  ) return true
  const text = docText.slice(node.from, node.to).trim()
  return text === '---' || text === '...'
}

function looksLikeCommentNode(node, docText) {
  if (!node) return false
  const name = node.name || ''
  if (name === 'Comment' || name.includes('Comment')) return true
  // fallback: treat pure comment text spans as comments
  const text = docText.slice(node.from, node.to)
  return /^\s*#/.test(text)
}

function isStructuralNode(node) {
  if (!node) return false
  const n = node.name || ''
  return (
    n === 'Pair' ||
    n.includes('Mapping') ||
    n.includes('Sequence') ||
    n.includes('Flow') ||
    n === 'BlockMapping' ||
    n === 'BlockSequence' ||
    n === 'FlowMapping' ||
    n === 'FlowSequence'
  )
}

function firstStructuralDescendant(node) {
  let found = null
  function walk(n) {
    if (!n || found) return
    if (isStructuralNode(n)) {
      found = n
      return
    }
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c)
  }
  walk(node)
  return found
}

function skipWrappers(node, docText) {
  const wrapperRoot = node

  while (node && ['yaml', 'Stream', 'Document'].includes(node.name)) {
    node = node.firstChild
  }

  // Skip leading noise (comments, directives, doc markers)
  while (node) {
    const name = node.name || ''
    if (
      name === 'Directive' ||
      looksLikeCommentNode(node, docText) ||
      isDocMarkerNode(node, docText)
    ) {
      node = node.nextSibling
      continue
    }
    break
  }

  // If we still landed on a non-structural token, walk siblings until something structural
  while (node && !isStructuralNode(node)) node = node.nextSibling

  // Fallback: some trees don't expose the mapping as a nextSibling after comment blocks
  if (!node) return firstStructuralDescendant(wrapperRoot)

  return node
}

function unwrapValue(node) {
  if (!node) return null

  if (node.name === 'Value' || node.name === 'Item') node = node.firstChild ?? node

  // Anchor / alias wrappers (node names vary)
  while (node && (
    node.name === 'Anchor' ||
    node.name === 'AnchoredValue' ||
    node.name === 'Alias' ||
    (node.name || '').includes('Anchor') ||
    (node.name || '').includes('Alias')
  )) {
    const next = node.firstChild ?? node.nextSibling
    if (!next || next === node) break
    node = next
  }

  return node
}

function findNodeAtPath(root, docText, path) {
  let node = skipWrappers(root, docText)
  for (const seg of path) {
    if (!node) return null
    node = unwrapValue(node)
    if (!node) return null
    node = typeof seg === 'number' ? findSeqItem(node, seg) : findMapValue(node, docText, String(seg))
  }
  return node
}

function findPairNode(mapNode, docText, key) {
  let child = mapNode.firstChild
  while (child) {
    if (child.name === 'Pair') {
      const keyNode = child.getChild('Key')
      if (keyNode && docText.slice(keyNode.from, keyNode.to).trim() === key) return child
    }
    child = child.nextSibling
  }
  return null
}

function findMapValue(mapNode, docText, key) {
  const pair = findPairNode(mapNode, docText, key)
  if (!pair) return null
  return pair.getChild('Value') ?? pair.lastChild
}

function findSeqItem(seqNode, index) {
  let count = 0
  let child = seqNode.firstChild
  while (child) {
    if (child.name === 'Item') {
      if (count === index) return child
      count++
    }
    child = child.nextSibling
  }
  return null
}

function lineStart(docText, pos) {
  return docText.lastIndexOf('\n', pos - 1) + 1
}

function lineEnd(docText, pos) {
  const nl = docText.indexOf('\n', pos)
  return nl === -1 ? docText.length : nl + 1
}

function lineIndentAt(docText, pos) {
  const ls = lineStart(docText, pos)
  const m = docText.slice(ls, pos).match(/^(\s*)/)
  return m ? m[1] : ''
}

function getIndent(docText, node) {
  return docText.slice(lineStart(docText, node.from), node.from).match(/^(\s*)/)[1]
}

function afterNodeLine(docText, node) {
  if (!node) return 0
  return lineEnd(docText, node.to)
}

function ensureLeadingNewline(docText, insertAt, text) {
  if (insertAt > 0 && docText[insertAt - 1] !== '\n') return `\n${text}`
  return text
}

function lastDescendantNamed(node, name) {
  let last = null
  function walk(n) {
    if (!n) return
    if (n.name === name) last = n
    for (let c = n.firstChild; c; c = c.nextSibling) walk(c)
  }
  walk(node)
  return last
}

function skipTrailingCommentAndBlankLines(docText, pos) {
  while (pos < docText.length) {
    const ls = lineStart(docText, pos)
    const le = lineEnd(docText, pos)
    const line = docText.slice(ls, le)
    if (/^\s*(#.*)?\n?$/.test(line)) {
      pos = le
      continue
    }
    break
  }
  return pos
}

function insertPosAfterPrelude(docText) {
  // For "no structural root" docs, keep any leading prelude:
  // directives, doc markers, comment-only lines, and blank lines.
  let pos = 0

  while (pos <= docText.length) {
    const ls = lineStart(docText, pos)
    const le = lineEnd(docText, pos)
    const line = docText.slice(ls, le).replace(/\r?\n$/, '')

    if (ls >= docText.length) return docText.length

    if (
      /^\s*$/.test(line) ||
      /^\s*#/.test(line) ||
      /^\s*%/.test(line) ||
      /^\s*---\s*$/.test(line) ||
      /^\s*\.\.\.\s*$/.test(line)
    ) {
      pos = le
      continue
    }

    return ls
  }

  return docText.length
}

function formatKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)
}

// Ensure keys in YAML blocks are quoted consistently with formatKey().
// This is intentionally conservative: it only rewrites simple `key:` forms.
function quoteUnsafeKeysInBlock(yamlText) {
  const lines = yamlText.replace(/\n$/, '').split('\n')
  const out = []

  for (const line of lines) {
    const trimmed = line.trimStart()
    if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('-') || trimmed.startsWith('?')) {
      out.push(line)
      continue
    }

    const m = line.match(/^(\s*)([^"'\s][^:]*?):(.*)$/)
    if (!m) {
      out.push(line)
      continue
    }

    const indent = m[1]
    const key = m[2]
    const rest = m[3]

    if (/^[A-Za-z0-9_-]+$/.test(key)) {
      out.push(line)
      continue
    }

    out.push(`${indent}${JSON.stringify(key)}:${rest}`)
  }

  return out.join('\n') + '\n'
}

function indentYamlBlock(yamlText, indent) {
  const normalized = quoteUnsafeKeysInBlock(yamlText)
  const lines = normalized.replace(/\n$/, '').split('\n')
  return lines.map(line => `${indent}${line}`).join('\n') + '\n'
}

function valueIndentForSeqItems(docText, seqNode) {
  const parentPair = seqNode.parent?.name === 'Value' ? seqNode.parent?.parent : seqNode.parent
  if (parentPair?.name === 'Pair') return `${getIndent(docText, parentPair)}  `
  return getIndent(docText, seqNode)
}

function mapIndentInSeqItem(docText, mapNode) {
  let p = mapNode.parent
  while (p && p.name === 'Value') p = p.parent
  if (p?.name === 'Item') return `${getIndent(docText, p)}  `
  return getIndent(docText, mapNode)
}

function findNextPairSibling(pairNode) {
  let n = pairNode?.nextSibling
  while (n) {
    if (n.name === 'Pair') return n
    n = n.nextSibling
  }
  return null
}

function isInlineDashLine(docText, pos) {
  const ls = lineStart(docText, pos)
  const le = lineEnd(docText, pos)
  const line = docText.slice(ls, le)
  return /^\s*-\s+/.test(line)
}

function formatBlockScalarString(str, baseIndent) {
  const rawLines = str.split('\n')
  if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop()

  const childIndent = `${baseIndent}  `
  let out = '|-\n'
  for (const line of rawLines) out += `${childIndent}${line}\n`
  return out
}

function formatMapAddLine(key, value, indent) {
  const k = formatKey(key)

  if (typeof value === 'string' && value.includes('\n')) {
    const block = formatBlockScalarString(value, indent)
    return `${indent}${k}: ${block}`
  }

  // Prefer block style for objects (real-world configs want this)
  const isObj = value !== null && typeof value === 'object'
  if (isObj) {
    const nestedYaml = YAML.stringify(value)
    return `${indent}${k}:\n${indentYamlBlock(nestedYaml, `${indent}  `)}`
  }

  const valueYaml = YAML.stringify(value).trim()
  return `${indent}${k}: ${valueYaml}\n`
}

function formatSeqAddLines(value, indent) {
  if (typeof value === 'string' && value.includes('\n')) {
    const rawLines = value.split('\n')
    if (rawLines.length && rawLines[rawLines.length - 1] === '') rawLines.pop()

    let out = `${indent}- |-\n`
    for (const line of rawLines) out += `${indent}    ${line}\n`
    return out
  }

  const valueYaml = YAML.stringify(value).trim()
  if (!valueYaml.includes('\n')) return `${indent}- ${valueYaml}\n`

  const raw = YAML.stringify(value).replace(/\n$/, '')
  const lines = raw.split('\n')
  let out = `${indent}- ${lines[0]}\n`
  for (let i = 1; i < lines.length; i++) out += `${indent}  ${lines[i]}\n`
  return out
}

function isFlowMappingNode(node, docText) {
  if (!node) return false
  const n = node.name || ''
  if (n.includes('Flow') && n.includes('Mapping')) return true
  const text = docText.slice(node.from, node.to).trim()
  return text.startsWith('{') && text.endsWith('}')
}

function isInsideFlowMapping(node, docText) {
  let n = node
  while (n) {
    if (isFlowMappingNode(n, docText)) return n
    n = n.parent
  }
  return null
}

function isFlowSequenceNode(node, docText) {
  if (!node) return false
  const n = node.name || ''
  if (n.includes('Flow') && n.includes('Sequence')) return true
  const text = docText.slice(node.from, node.to).trim()
  return text.startsWith('[') && text.endsWith(']')
}

function isInsideFlowSequence(node, docText) {
  let n = node
  while (n) {
    if (isFlowSequenceNode(n, docText)) return n
    n = n.parent
  }
  return null
}

function removeFlowPairRange(docText, pairNode) {
  let from = pairNode.from
  let to = pairNode.to

  while (from > 0 && /[ \t]/.test(docText[from - 1])) from--

  if (docText[from - 1] === '{' && docText[from] === ' ') from++

  if (docText[from - 1] === ',') {
    from--
    while (from > 0 && /[ \t]/.test(docText[from - 1])) from--
  } else {
    while (to < docText.length && /[ \t]/.test(docText[to])) to++
    if (docText[to] === ',') {
      to++
      if (docText[to] === ' ') to++
    }
  }

  return { from, to }
}

function removeFlowItemRange(docText, itemNode) {
  let from = itemNode.from
  let to = itemNode.to

  while (from > 0 && /[ \t]/.test(docText[from - 1])) from--

  if (docText[from - 1] === ',') {
    from--
    while (from > 0 && /[ \t]/.test(docText[from - 1])) from--
  } else {
    while (to < docText.length && /[ \t]/.test(docText[to])) to++
    if (docText[to] === ',') {
      to++
      if (docText[to] === ' ') to++
    }
  }

  if (docText[from - 1] === '[' && docText[from] === ' ') from++

  return { from, to }
}

function addFlowPair(docText, flowNode, key, value) {
  const k = formatKey(key)
  const v = YAML.stringify(value).trim()
  const text = docText.slice(flowNode.from, flowNode.to)
  const hasPair = /\S/.test(text.replace(/[{}]/g, '').trim())

  let close = docText.lastIndexOf('}', flowNode.to)
  if (close < flowNode.from) close = flowNode.to - 1

  let insertAt = close
  let suffix = ''
  if (docText[close - 1] === ' ') insertAt = close - 1
  else suffix = ' '

  const prefix = hasPair ? ', ' : ' '
  return {
    from: insertAt,
    to: insertAt,
    insert: `${prefix}${k}: ${v}${suffix}`
  }
}

function addFlowItem(docText, flowSeqNode, value) {
  const v = YAML.stringify(value).trim()

  let close = docText.lastIndexOf(']', flowSeqNode.to)
  if (close < flowSeqNode.from) close = flowSeqNode.to - 1

  let open = docText.indexOf('[', flowSeqNode.from)
  if (open < 0 || open > close) open = flowSeqNode.from

  const innerRaw = docText.slice(open + 1, close)
  const innerTrim = innerRaw.trim()
  const hasItem = innerTrim.length > 0

  if (!hasItem) {
    return { from: open + 1, to: close, insert: v }
  }

  let trimFrom = close
  while (trimFrom > open + 1 && /[ \t]/.test(docText[trimFrom - 1])) trimFrom--

  return { from: trimFrom, to: close, insert: `, ${v}` }
}

function anchoredPrefix(docText, node) {
  const raw = docText.slice(node.from, node.to)
  const m = raw.match(/^(\s*&[A-Za-z0-9_-]+\s+)(.*)$/s)
  return m ? m[1] : ''
}

function pairSeparatorRange(docText, pairNode, valueNode) {
  const searchFrom = pairNode.from
  const searchTo = Math.min(valueNode.from, pairNode.to)
  const slice = docText.slice(searchFrom, searchTo)
  const colonRel = slice.indexOf(':')
  if (colonRel === -1) return null

  const colonPos = searchFrom + colonRel
  return { from: colonPos + 1, to: valueNode.from }
}

function lineCommentFrom(docText, pos) {
  const ls = lineStart(docText, pos)
  const le = lineEnd(docText, pos)
  const line = docText.slice(ls, le)
  const i = line.indexOf('#')
  return i === -1 ? '' : line.slice(i).replace(/\n$/, '')
}

function stripLineComment(docText, pos) {
  const ls = lineStart(docText, pos)
  const le = lineEnd(docText, pos)
  const line = docText.slice(ls, le)
  const i = line.indexOf('#')
  if (i === -1) return null

  // also remove any spaces immediately before the '#'
  let from = ls + i
  while (from > ls && /[ \t]/.test(docText[from - 1])) from--

  return { from, to: le - 1 }
}

// Single-op patching against a single (current) parse tree + doc text
function cmYAMLPatchChangesAtomic(root, docText, patch) {
  const changes = []

  for (const op of patch) {
    const path = op.path
    const lastSeg = path[path.length - 1]

    if (op.op === 'replace') {
      const valueNode = unwrapValue(findNodeAtPath(root, docText, path))
      if (!valueNode) continue

      const parentNode = path.length
        ? unwrapValue(findNodeAtPath(root, docText, path.slice(0, -1)))
        : null

      const isMapKey = path.length && typeof lastSeg !== 'number'
      const pairNode = (isMapKey && parentNode)
        ? findPairNode(parentNode, docText, String(lastSeg))
        : null

      const anchor = anchoredPrefix(docText, valueNode)

      const rawYaml = YAML.stringify(op.value)
      const scalar = rawYaml.trim()
      const isCollection = op.value !== null && typeof op.value === 'object'

      if (typeof op.value === 'string' && op.value.includes('\n')) {
        const keyLineIndent = lineIndentAt(docText, valueNode.from)
        const insert = formatBlockScalarString(op.value, keyLineIndent)

        changes.push({
          from: valueNode.from,
          to: valueNode.to,
          insert: anchor ? `${anchor}${insert.trimEnd()}` : insert.trimEnd()
        })
        continue
      }

      if (pairNode && isCollection) {
        const comment = lineCommentFrom(docText, pairNode.from)
        const commentRange = stripLineComment(docText, pairNode.from)
        if (commentRange) changes.push({ from: commentRange.from, to: commentRange.to, insert: '' })

        const indent = getIndent(docText, pairNode)
        const block = indentYamlBlock(rawYaml, `${indent}  `).trimEnd()
        const sep = pairSeparatorRange(docText, pairNode, valueNode)
        if (sep) {
          const suffix = comment ? ` ${comment}\n` : `\n`
          changes.push({ from: sep.from, to: sep.to, insert: suffix })
        }

        changes.push({ from: valueNode.from, to: valueNode.to, insert: block })
        continue
      }

      if (pairNode && !isCollection) {
        const sep = pairSeparatorRange(docText, pairNode, valueNode)
        if (sep) {
          const between = docText.slice(sep.from, sep.to)
          if (between.includes('\n') && !between.includes('#')) {
            changes.push({ from: sep.from, to: sep.to, insert: ' ' })
          }
        }
      }

      changes.push({
        from: valueNode.from,
        to: valueNode.to,
        insert: anchor ? `${anchor}${scalar}` : scalar
      })
      continue
    }

    if (op.op === 'remove') {
      const parentNode = unwrapValue(findNodeAtPath(root, docText, path.slice(0, -1)))
      if (!parentNode) continue

      const target = typeof lastSeg === 'number'
        ? findSeqItem(parentNode, lastSeg)
        : findPairNode(parentNode, docText, String(lastSeg))
      if (!target) continue

      const flowSeq = isInsideFlowSequence(target, docText)
      if (flowSeq) {
        const r = removeFlowItemRange(docText, target)
        changes.push({ from: r.from, to: r.to, insert: '' })
        continue
      }

      const flow = isInsideFlowMapping(target, docText)
      if (flow && target.name === 'Pair') {
        const r = removeFlowPairRange(docText, target)
        changes.push({ from: r.from, to: r.to, insert: '' })
        continue
      }

      const from = lineStart(docText, target.from)
      const to = lineEnd(docText, target.to)
      changes.push({ from, to, insert: '' })

      if (target.name === 'Pair' && isInlineDashLine(docText, target.from)) {
        const nextPair = findNextPairSibling(target)
        if (nextPair) {
          let p = parentNode.parent
          while (p && p.name === 'Value') p = p.parent
          if (p?.name === 'Item') {
            const itemIndent = getIndent(docText, p)
            const mapIndent = `${itemIndent}  `
            const ls = lineStart(docText, nextPair.from)
            changes.push({
              from: ls,
              to: ls + mapIndent.length,
              insert: `${itemIndent}- `
            })
          }
        }
      }

      continue
    }

    if (op.op === 'add') {
      const parentPath = path.slice(0, -1)
      const parentNode = unwrapValue(findNodeAtPath(root, docText, parentPath))

      // Empty document / no structural root: allow root-level add,
      // but preserve leading prelude (directives / doc markers / comments / blanks).
      if (!parentNode && parentPath.length === 0 && typeof lastSeg !== 'number') {
        const newText = formatMapAddLine(String(lastSeg), op.value, '')
        const insertAt = insertPosAfterPrelude(docText)
        changes.push({
          from: insertAt,
          to: insertAt,
          insert: ensureLeadingNewline(docText, insertAt, newText)
        })
        continue
      }

      if (!parentNode) continue

      if (typeof lastSeg !== 'number' && isFlowMappingNode(parentNode, docText)) {
        const flowAdd = addFlowPair(docText, parentNode, String(lastSeg), op.value)
        changes.push(flowAdd)
        continue
      }

      if (typeof lastSeg === 'number' && isFlowSequenceNode(parentNode, docText)) {
        const flowAdd = addFlowItem(docText, parentNode, op.value)
        changes.push(flowAdd)
        continue
      }

      if (typeof lastSeg === 'number') {
        const items = []
        let child = parentNode.firstChild
        while (child) {
          if (child.name === 'Item') items.push(child)
          child = child.nextSibling
        }

        const indent = valueIndentForSeqItems(docText, parentNode)
        const newText = formatSeqAddLines(op.value, indent)

        let insertAt = lastSeg >= items.length
          ? (items.length ? afterNodeLine(docText, items[items.length - 1]) : afterNodeLine(docText, parentNode))
          : lineStart(docText, items[lastSeg].from)

        insertAt = skipTrailingCommentAndBlankLines(docText, insertAt)

        changes.push({
          from: insertAt,
          to: insertAt,
          insert: ensureLeadingNewline(docText, insertAt, newText)
        })
      } else {
        const key = String(lastSeg)
        const indent = mapIndentInSeqItem(docText, parentNode)
        const newText = formatMapAddLine(key, op.value, indent)

        const lastPair = lastDescendantNamed(parentNode, 'Pair')
        let insertAt = lastPair ? afterNodeLine(docText, lastPair) : afterNodeLine(docText, parentNode)

        insertAt = skipTrailingCommentAndBlankLines(docText, insertAt)

        changes.push({
          from: insertAt,
          to: insertAt,
          insert: ensureLeadingNewline(docText, insertAt, newText)
        })
      }

      continue
    }
  }

  changes.sort((a, b) => a.from - b.from)
  return changes
}

function applyChanges(docText, changes) {
  let out = docText
  for (let i = changes.length - 1; i >= 0; i--) {
    const { from, to, insert } = changes[i]
    out = out.slice(0, from) + insert + out.slice(to)
  }
  return out
}

// JSON Patch semantics: ops apply sequentially to the updated document.
// We implement that by reparsing the document for each op, then returning a single
// full-document replacement change.
export default function cmYAMLPatchChanges(_root, docText, patch) {
  let current = docText

  for (const op of patch) {
    const state = EditorState.create({ doc: current, extensions: [yaml()] })
    const tree = ensureSyntaxTree(state, current.length)
    if (!tree) continue

    const stepChanges = cmYAMLPatchChangesAtomic(tree.topNode, current, [op])
    if (!stepChanges.length) continue
    current = applyChanges(current, stepChanges)
  }

  if (current === docText) return []
  return [{ from: 0, to: docText.length, insert: current }]
}