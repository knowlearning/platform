// DFS through the CodeMirror YAML syntax tree to locate and apply patch operations
import YAML from 'yaml'

function skipWrappers(node) {
  while (node && ['yaml', 'Stream', 'Document'].includes(node.name)) {
    node = node.firstChild
  }
  return node
}

function unwrapValue(node) {
  if (!node) return null
  if (node.name === 'Value' || node.name === 'Item') return node.firstChild ?? node
  return node
}

function findNodeAtPath(root, docText, path) {
  let node = skipWrappers(root)
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

function getIndent(docText, node) {
  return docText.slice(lineStart(docText, node.from), node.from).match(/^(\s*)/)[1]
}

export default function cmYAMLPatchChanges(root, docText, patch) {
  const changes = []

  for (const op of patch) {
    const path = op.path
    const lastSeg = path[path.length - 1]

    if (op.op === 'replace') {
      const valueNode = unwrapValue(findNodeAtPath(root, docText, path))
      if (!valueNode) continue
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
      const from = lineStart(docText, target.from)
      let to = target.to
      if (docText[to] === '\n') to++
      changes.push({ from, to, insert: '' })
      continue
    }

    if (op.op === 'add') {
      const parentNode = unwrapValue(findNodeAtPath(root, docText, path.slice(0, -1)))
      if (!parentNode) continue
      const indent = getIndent(docText, parentNode)
      const valueYaml = YAML.stringify(op.value).trim()

      if (typeof lastSeg === 'number') {
        const items = []
        let child = parentNode.firstChild
        while (child) {
          if (child.name === 'Item') items.push(child)
          child = child.nextSibling
        }
        const newLine = `${indent}- ${valueYaml}\n`
        const insertAt = lastSeg >= items.length
          ? parentNode.to
          : lineStart(docText, items[lastSeg].from)
        changes.push({ from: insertAt, to: insertAt, insert: newLine })
      } else {
        const newLine = `${indent}${lastSeg}: ${valueYaml}\n`
        changes.push({ from: parentNode.to, to: parentNode.to, insert: newLine })
      }
      continue
    }
  }

  changes.sort((a, b) => a.from - b.from)
  return changes
}
