<script setup>
  import { ref } from 'vue'
  const { report } = defineProps({ report: String })
  const reportData = ref(null)
  Agent.watch(report, ({ state }) => {
    reportData.value = state
  })
</script>

<template>
  <div v-if="reportData">{{ report }} {{ reportData.tasks }}</div>
</template>