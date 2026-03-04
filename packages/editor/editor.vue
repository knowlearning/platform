<script setup>
import Agent from '@knowlearning/agents'
import { ref, watch, computed } from 'vue'
import { compare, applyPatch } from 'fast-json-patch'
import CodeMirror from 'vue-codemirror6'
import YAML from 'yaml'
import patchYamlAST from './patch-yaml-ast.js'
import makeGutterDraggable from './make-gutter-draggable.js'
import getExtensions from './get-extensions.js'
import useDarkMode from './use-dark-mode.js'

import { Transaction } from '@codemirror/state'
import { EditorView } from '@codemirror/view'

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

function computeTextFromState(s) {
  if (s.__yaml) return s.__yaml
  const shallowCopy = { ...s }
  delete shallowCopy.__yaml
  return YAML.stringify(shallowCopy)
}

function applyYAMLToState(value) {
  try {
    state.__yaml = value

    const shallowCopy = { ...state }
    const valueShallowCopy = YAML.parse(value, { strict: true })

    delete shallowCopy.__yaml
    delete valueShallowCopy.__yaml

    applyPatch(
      state,
      compare(shallowCopy, valueShallowCopy)
    )
  } catch (error) {
    console.log('Error setting doc', error)
  }
}

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

// Load initial state first so CM is never created with a blank doc (undo-safe)
const state = await Agent.state(id)

const syncedYAMLDoc = YAML.parseDocument(state.__yaml || '', {
  strict: true,
  keepCstNodes: true,
  keepNodeTypes: true,
  keepSourceTokens: true
})

Agent.watch(id, ({ patch }) => {
  if (patch) {
    const nonYAMLOps = patch.filter(({ path, from }) => ((path || from)[0] !== '__yaml'))
    if (nonYAMLOps.length) {
      const updates = patchYamlAST(syncedYAMLDoc, nonYAMLOps)
      console.log('YAML patch updates', updates)

      // optional editor update if needed
      // const nextYaml = String(syncedYAMLDoc)
      // setEditorDoc(nextYaml, { addToHistory: false })
      // applyYAMLToState(nextYaml)
    }
  }
})

ready.value = true

makeGutterDraggable(cm, emit)

const updateListener = EditorView.updateListener.of(update => {
  if (!update.docChanged) return
  if (isProgrammaticChange.value) return

  const value = update.state.doc.toString()
  if (value === state.__yaml) return

  applyYAMLToState(value)
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