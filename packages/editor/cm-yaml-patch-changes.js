// DFS through the CodeMirror YAML syntax tree to locate and apply patch operations
import YAML from 'yaml'

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

function skipWrappers(node, docText) {
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

  return node
}

function unwrapValue(node) {
  if (!node) return null
  if (node.name === 'Value' || node.name === 'Item') return node.firstChild ?? node
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

function formatKey(key) {
  return /^[A-Za-z0-9_-]+$/.test(key) ? key : JSON.stringify(key)
}

function indentYamlBlock(yamlText, indent) {
  const lines = yamlText.replace(/\n$/, '').split('\n')
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

  const valueYaml = YAML.stringify(value).trim()

  if (valueYaml.includes('\n')) {
    const nestedYaml = YAML.stringify(value)
    return `${indent}${k}:\n${indentYamlBlock(nestedYaml, `${indent}  `)}`
  }

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

function removeFlowPairRange(docText, pairNode) {
  let from = pairNode.from
  let to = pairNode.to

  // absorb surrounding spaces
  while (from > 0 && /[ \t]/.test(docText[from - 1])) from--

  // Prefer removing a preceding ", " if present, otherwise remove a following ", "
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

function addFlowPair(docText, flowNode, key, value) {
  const k = formatKey(key)
  const v = YAML.stringify(value).trim()
  const text = docText.slice(flowNode.from, flowNode.to)
  const hasPair = /\S/.test(text.replace(/[{}]/g, '').trim())

  // find closing brace within node span
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

export default function cmYAMLPatchChanges(root, docText, patch) {
  const changes = []

  for (const op of patch) {
    const path = op.path
    const lastSeg = path[path.length - 1]

    if (op.op === 'replace') {
      const valueNode = unwrapValue(findNodeAtPath(root, docText, path))
      if (!valueNode) continue

      if (typeof op.value === 'string' && op.value.includes('\n')) {
        const keyLineIndent = lineIndentAt(docText, valueNode.from)
        const insert = formatBlockScalarString(op.value, keyLineIndent)

        changes.push({
          from: valueNode.from,
          to: valueNode.to,
          insert: insert.trimEnd()
        })
        continue
      }

      changes.push({
        from: valueNode.from,
        to: valueNode.to,
        insert: YAML.stringify(op.value).trim()
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

      // Flow-map key removal: remove just the pair (and a comma), not the whole line
      const flow = isInsideFlowMapping(target, docText)
      if (flow && target.name === 'Pair') {
        const r = removeFlowPairRange(docText, target)
        changes.push({ from: r.from, to: r.to, insert: '' })
        continue
      }

      const from = lineStart(docText, target.from)
      const to = lineEnd(docText, target.to)
      changes.push({ from, to, insert: '' })

      // Limited promotion rule for inline "- a: 1" removal
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
      const parentNode = unwrapValue(findNodeAtPath(root, docText, path.slice(0, -1)))
      if (!parentNode) continue

      // Flow-map add: insert into braces instead of new line
      if (typeof lastSeg !== 'number' && isFlowMappingNode(parentNode, docText)) {
        const flowAdd = addFlowPair(docText, parentNode, String(lastSeg), op.value)
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