<script setup>
  import NodeMetrics from './metrics/node.vue'

  const serverSessions = Object.keys(await Agent.state('metrics', 'node', 'core'))

</script>

<template>
  <div style="display: flex;">
    <div
      v-for="session in serverSessions"
      :key="session"
    >
      <NodeMetrics :session="session" />
    </div>
  </div>
</template>