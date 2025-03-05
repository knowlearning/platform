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

  const state = await Agent.state(id)
  const cm = ref()

  const code = computed({
    get() {
      return YAML.stringify(state, { sortMapEntries: true })
    },
    set(value) {
      try {
        applyPatch(
          state,
          compare(
            state,
            YAML.parse(value, { strict: true })
          )
        )
      }
      catch (error) {
        console.log('ERROR PARSING WORLD EDIT')
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