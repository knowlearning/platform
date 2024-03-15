<script setup>
  import { ref } from 'vue'
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'
  const { report } = defineProps({ report: String })
  const reportData = ref(null)
  Agent.watch(report, ({ state }) => {
    reportData.value = state
  })
</script>

<template>
  <vueScopeComponent :id="report" v-slot="{ loading, value }">
    <div v-if="loading">loading...</div>
    <pre v-else>{{value}}</pre>
  </vueScopeComponent>
</template>