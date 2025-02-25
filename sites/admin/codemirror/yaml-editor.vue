<script setup>
  import { computed, reactive, ref } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import mixedLanguageYaml from "./mixed-language-yaml.js"
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

  const state = reactive(await Agent.state(id))
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
      return {
        ...resolveWidget(path),
        view: cm.value?.view
      }
    }
  })

  function handleReady(cmInfo) {
    console.log('READY....', cmInfo)
    view = cmInfo.view
  }
</script>

<template>
  <CodeMirror
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
