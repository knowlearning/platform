<script setup>
  import { computed } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import mixedLanguageYaml from "./codemirror/mixed-language-yaml.js"
  import VueWidgetPlugin from './codemirror/vue-widget-plugin.js'
  import YAML from "yaml"

  const {
    id,
    resolveLanguage,
    resolveWidget
  } = defineProps({
    id: String,
    resolveLanguage: Function,
    resolveWidget: Function
  })

  const state = await Agent.state(id)

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
    resolveWidget
  })
</script>

<template>
  <CodeMirror
    basic
    tab
    gutter
    v-model="code"
    :linter="()=>[]"
    :extensions="[
      mixedLangaugeYamlExtension
    ]"
  />
</template>
