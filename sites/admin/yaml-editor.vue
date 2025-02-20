<script setup>
  import { computed } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from 'vue-codemirror6'
  import mixedLanguageYaml from './codemirror/mixed-language-yaml.js'
  import YAML from "yaml"

  const props = defineProps({ id: String })

  const state = await Agent.state(props.id)

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

  const { lang, linter } = mixedLanguageYaml({
    resolveLanguage(path) {
      if (path[path.length-1] === 'markdown') return 'markdown'
      if (path[path.length-1] === 'postgresql') return 'postgresql'
      else return 'javascript'
    }
  })
</script>

<template>
  <CodeMirror
    basic
    tab
    gutter
    v-model="code"
    :lang="lang"
    :linter="linter"
  />
</template>
