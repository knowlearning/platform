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
  console.log('state value', state.value)
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
          const diff = compare(YAML.parse(doc, { strict: true }), state.value)
          //  TODO: smarter text insertion update
          return diff.length ? YAML.stringify(state.value, { blockQuote: 'literal' }) : doc
        }
        catch (error) {
          return doc
        }
      }
      else return  YAML.stringify(state.value, { blockQuote: 'literal' })
    },
    set(value) {
      try {
        applyPatch(
          state.value,
          compare(
            state.value,
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