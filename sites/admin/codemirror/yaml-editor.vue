<script setup>
  import { computed, reactive, ref, watch } from 'vue'
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

  const state = await Agent.state(id)
  const cm = ref()

  const code = computed({
    get() {
      return YAML.stringify(state, { sortMapEntries: true })
    },
    set(value) {
      console.log('SETTING NEW VALUE???')
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

  watch(() => cm.value, () => {
    console.log('CM VALUE', cm.value)
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
