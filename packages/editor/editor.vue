<script setup>
  import Agent from '@knowlearning/agents'
  import { computed, reactive, ref, watch } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import mixedLanguageYaml from "./mixed-language-yaml.js"
  import YAML from "yaml"

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

  const state = ref(await Agent.state(id))
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

</script>

<template>
  <CodeMirror
    :class="{
      'cm-editor-wrapper': true,
      'fill-height': fillHeight
    }"
    basic
    tab
    gutter
    v-model="code"
    ref="cm"
    :linter="()=>[]"
    :extensions="[
      mixedLangaugeYamlExtension
    ]"
  />
</template>

<style>

  .cm-editor-wrapper.vue-codemirror.fill-height,
  .cm-editor-wrapper.fill-height .cm-editor {
    height: 100%;
  }

</style>