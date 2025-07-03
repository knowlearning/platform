<script setup>
  import Agent from '@knowlearning/agents'
  import { computed, reactive, ref, watch } from 'vue'
  import { compare, applyPatch } from 'fast-json-patch'
  import CodeMirror from "vue-codemirror6"
  import mixedLanguageYaml from "./mixed-language-yaml.js"
  import YAML, { parseDocument } from "yaml"

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

  let outstandingPatch = null

  Agent.watch(id, async () => {
    while (outstandingPatch) {
      await Promise.all([
        outstandingPatch,
        new Promise(r => setTimeout(r, 1000))
      ])
    }
    Agent.state(id).then(value => {
      if (compare(state.value, value).length) {
        state.value = value
      }
    })
  })

  const code = computed({
    get() {
      if (cm.value) {
        const doc = cm.value.view.state.doc.toString()
        try {
          const yamlAst = parseDocument(doc)
          if (state.value.__yaml) state.value.__yaml = {}

          const diff = compare(yamlAst, state.value.__yaml)
          //  TODO: smarter text insertion update
          return diff.length ? yamlAst.toString() : doc
        }
        catch (error) {
          console.log('Error Getting Doc', error)
          return doc
        }
      }
      else return  YAML.stringify(state.value, { blockQuote: 'literal' })
    },
    set(value) {
      try {
        const yamlAst = parseDocument(value)

        applyPatch(
          state.value.__yaml,
          compare(
            state.value.__yaml,
            yamlAst
          )
        )

        const shallowCopy = { ...state.value }
        delete shallowCopy.__yaml
        delete value.__yaml

        applyPatch(
          state.value,
          compare(
            shallowCopy,
            YAML.parse(value, { strict: true })
          )
        )
        const thisOutstandingPatch = (
          Agent
            .synced()
            .then(() => setTimeout(() => {
              if (outstandingPatch === thisOutstandingPatch) outstandingPatch = null
            }, 1000))
        )

        outstandingPatch = thisOutstandingPatch
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