<script setup>
  import Agent from '@knowlearning/agents'
  import { computed, reactive, ref, watch, onMounted, onUnmounted, onBeforeUnmount } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import mixedLanguageYaml from "./mixed-language-yaml.js"
  import YAML from "yaml"
  import patchYamlAST from './patch-yaml-ast.js'
  import draggable from './draggable.js'

  import { syntaxHighlighting, defaultHighlightStyle } from '@codemirror/language'
  import { oneDark, oneDarkHighlightStyle } from '@codemirror/theme-one-dark'

  const isDark = ref(false)

  onMounted(() => {
    const mql = window.matchMedia('(prefers-color-scheme: dark)')
    const sync = () => (isDark.value = mql.matches)
    sync()

    // Safari < 14 fallback
    if (mql.addEventListener) mql.addEventListener('change', sync)
    else mql.addListener(sync)

    onBeforeUnmount(() => {
      if (!mql) return
      if (mql.removeEventListener) mql.removeEventListener('change', sync)
      else mql.removeListener(sync)
    })
  })

  const theme = computed(() => (isDark.value ? oneDark : undefined))

  const extensions = computed(() => {
    const e = [
      mixedLangaugeYamlExtension,
      syntaxHighlighting(isDark.value ? oneDarkHighlightStyle : defaultHighlightStyle)
    ]
    if (isDark.value) e.push(oneDark)
    return e
  })













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

  const state = ref(await new Promise(resolve => {
    Agent.watch(id, ({ patch, state }) => {
      if (patch) {
        const nonYAMLOps = patch.filter(({ path, from }) => ((path||from)[0] !== '__yaml'))
        patchYamlAST(syncedYAMLDoc, nonYAMLOps)
      }
      else {
        //  TODO: ensure __yaml and state are synced
        syncedYAMLDoc = YAML.parseDocument(state.__yaml || '', {
          strict: true,
          keepCstNodes: true,
          keepNodeTypes: true,
          keepSourceTokens: true
        })
        resolve(state)
      }
    })
  }))

  const cm = ref()

  const code = computed({
    get() {
      if (state.value.__yaml) return state.value.__yaml
      else {
        const shallowCopy = { ...state.value }
        return YAML.stringify(shallowCopy)
      }
    },
    set(value) {
      try {
        state.value.__yaml = value

        const shallowCopy = { ...state.value }
        const valueShallowCopy = YAML.parse(value, { strict: true })

        delete shallowCopy.__yaml
        delete valueShallowCopy.__yaml

        applyPatch(
          state.value,
          compare(
            shallowCopy,
            valueShallowCopy
          )
        )
      }
      catch (error) {
        console.log('Error Setting Doc', error)
      }
    }
  })

  const mixedLangaugeYamlExtension = mixedLanguageYaml({
    resolveLanguage,
    resolveWidget: path => {
      const widget = resolveWidget(path)
      return widget ? {
        ...widget,
        codemirror: cm.value
      } : null
    }
  })

  let dragTeardown
  onMounted(() => {
    const view = cm.value?.view
    const gutterEl = view.dom.querySelector('.cm-gutters')
    const emitGutterDrag = event => emit('gutter-drag', event)

    const teardown = draggable(gutterEl)
    gutterEl.addEventListener('drag', emitGutterDrag)

    dragTeardown = () => {
      teardown()
      gutterEl.removeEventListener('drag', emitGutterDrag)
    }
    console.log(gutterEl)
  })

  onUnmounted(() => {
    dragTeardown?.()
  })

</script>

<template>
  <CodeMirror
    v-model="code"
    ref="cm"
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