<script setup>
  import Agent from '@knowlearning/agents'
  import { onMounted, ref } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import YAML from "yaml"
  import patchYamlAST from './patch-yaml-ast.js'
  import makeGutterDraggable from './make-gutter-draggable.js'
  import getExtensions from './get-extensions.js'
  import useDarkMode from './use-dark-mode.js'

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

  let syncedYAMLDoc
  let applyingFromState = false

  const state = ref(await new Promise(resolve => {
    Agent.watch(id, (agentState) => {
      const { patch } = agentState
      if (patch) {
        const nonYAMLOps = patch.filter(({ path, from }) => ((path||from)[0] !== '__yaml'))
        if (nonYAMLOps.length) {
          const { updates } = patchYamlAST(syncedYAMLDoc, nonYAMLOps)
          if (cm.value?.view && updates.length) {
            applyingFromState = true
            cm.value.view.dispatch({ changes: updates })
            applyingFromState = false
            state.value.__yaml = cm.value.view.state.doc.toString()
          }
        }
      }
      else {
        //  TODO: ensure __yaml and state are synced
        syncedYAMLDoc = YAML.parseDocument(agentState.state.__yaml || '', {
          strict: true,
          keepCstNodes: true,
          keepNodeTypes: true,
          keepSourceTokens: true
        })
        resolve(agentState.state)
      }
    })
  }))

  const cm = ref()

  onMounted(() => {
    const view = cm.value?.view
    if (!view) return
    const initialText = state.value.__yaml || YAML.stringify({ ...state.value })
    applyingFromState = true
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: initialText } })
    applyingFromState = false
  })

  function onCmUpdate(viewUpdate) {
    if (applyingFromState) return
    const newText = viewUpdate.state.doc.toString()
    syncedYAMLDoc = YAML.parseDocument(newText, {
      strict: true, keepCstNodes: true, keepNodeTypes: true, keepSourceTokens: true
    })
    try {
      state.value.__yaml = newText
      const shallowCopy = { ...state.value }
      const valueShallowCopy = YAML.parse(newText, { strict: true })
      delete shallowCopy.__yaml
      delete valueShallowCopy.__yaml
      applyPatch(state.value, compare(shallowCopy, valueShallowCopy))
    } catch (error) {
      console.log('Error Setting Doc', error)
    }
  }

  const extensions = getExtensions({cm, isDark, resolveLanguage, resolveWidget})
  makeGutterDraggable(cm, emit)

</script>

<template>
  <CodeMirror
    ref="cm"
    @update="onCmUpdate"
    :class="{
      'cm-editor-wrapper': true,
      'fill-height': fillHeight
    }"
    basic
    tab
    gutter
    :dark="isDark"
    :linter="()=>[]"
    :extensions="extensions"
  />
</template>

<style>

  .cm-editor-wrapper.vue-codemirror.fill-height,
  .cm-editor-wrapper.fill-height .cm-editor {
    height: 100%;
  }

</style>