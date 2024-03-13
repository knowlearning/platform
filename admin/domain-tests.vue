<template>
  <div v-if="isTestDomain">
    testing {{ domain }}
  </div>
  <div v-else>
    {{ domain }}
  </div>
</template>

<script setup>
  import { computed } from 'vue'
  const props = defineProps({ domain: String })

  const isTestDomain = computed(() => props.domain.endsWith('.test'))
</script>