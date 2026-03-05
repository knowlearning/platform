<script setup>
import Agent from '@knowlearning/agents'
import { ref, watch, computed } from 'vue'
import { compare, applyPatch } from 'fast-json-patch'
import CodeMirror from 'vue-codemirror6'
import YAML from 'yaml'
import makeGutterDraggable from './make-gutter-draggable.js'
import getExtensions from './get-extensions.js'
import useDarkMode from './use-dark-mode.js'

import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { syntaxTree } from '@codemirror/language'

const isDark = useDarkMode()

const {
  id,
  resolveLanguage,
  resolveWidget,
  fillHeight
} = defineProps({
  id: String,
  resolveLanguage: Function,
  resolveWidget: Function,
  fillHeight: Boolean
})

const emit = defineEmits(['gutter-drag'])
const ready = ref(false)
const cm = ref()

// mirrors what's currently in the CM doc (not bound to the component)
const isProgrammaticChange = ref(false)

// Load initial state first so CM is never created with a blank doc (undo-safe)
const state = await Agent.state(id)

const syncedYAMLDoc = YAML.parseDocument(state.__yaml || '', {
  strict: true,
  keepCstNodes: true,
  keepNodeTypes: true,
  keepSourceTokens: true
})

Agent.watch(id, ({ patch }) => {
  //  ignore null patch (first callback call w/ state) and patches that include __yaml syncs
  if (patch &&  patch[0].path[0] !== '__yaml') {
    const view = cm.value?.view
    if (!view) return

    isProgrammaticChange.value = true
    const tree = syntaxTree(view.state)
    const docText = view.state.doc.toString()
    const changes = computeChangesFromPatch(tree.topNode, docText, patch)
    if (changes.length) {
      view.dispatch({
        changes,
        annotations: Transaction.addToHistory.of(false)
      })
    }
    isProgrammaticChange.value = false
  }
})

ready.value = true

makeGutterDraggable(cm, emit)

const updateListener = EditorView.updateListener.of(update => {
  if (!update.docChanged) return
  if (isProgrammaticChange.value) return

  const value = update.state.doc.toString()
  if (value === state.__yaml) return

  try {
    const shallowCopy = { ...state }
    const valueShallowCopy = YAML.parse(value, { strict: true })

    state.__yaml = value
    delete shallowCopy.__yaml
    delete valueShallowCopy.__yaml

    applyPatch(
      state,
      compare(shallowCopy, valueShallowCopy)
    )
  } catch (error) {
    console.log('Error setting doc', error)
  }
})

const extensions = getExtensions({ cm, isDark, resolveLanguage, resolveWidget,  extra: [updateListener] })

watch(
  cm,
  (cmp) => {
    if (cmp?.view) {
      const yaml = computeTextFromState(state)
      setEditorDoc(yaml, { addToHistory: false })
    }
  },
  { immediate: true }
)

function setEditorDoc(value, { addToHistory = false } = {}) {
  const view = cm.value?.view
  if (!view) return

  const current = view.state.doc.toString()
  if (current === value) return

  isProgrammaticChange.value = true
  view.dispatch({
    changes: { from: 0, to: view.state.doc.length, insert: value },
    annotations: Transaction.addToHistory.of(!!addToHistory)
  })
  isProgrammaticChange.value = false
}

function computeTextFromState(s) {
  if (s.__yaml) return s.__yaml
  const shallowCopy = { ...s }
  delete shallowCopy.__yaml
  return YAML.stringify(shallowCopy)
}

// DFS through the CodeMirror YAML syntax tree to locate and apply patch operations

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

function computeChangesFromPatch(root, docText, patch) {
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

</script>

<template>
  <CodeMirror
    v-if="ready"
    ref="cm"
    :class="{
      'cm-editor-wrapper': true,
      'fill-height': fillHeight
    }"
    basic
    tab
    gutter
    :dark="isDark"
    :linter="() => []"
    :extensions="extensions"
  />
</template>

<style>
.cm-editor-wrapper.vue-codemirror.fill-height,
.cm-editor-wrapper.fill-height .cm-editor {
  height: 100%;
}
</style>