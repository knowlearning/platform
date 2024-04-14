<template>
  <slot :loading="loading" :value="value">
    <span>{{ defaultRenderedValue }}</span>
  </slot>
</template>

<script setup>
  import { ref, watch, onMounted, onBeforeUnmount, computed } from 'vue'

  const props = defineProps({
    id: String,
    path: { type: Array, default: [] },
    placeholder: { type: String, default: '' },
    metadata: { type: Boolean, default: false }
  })

  const value = ref(undefined)
  const loading = ref(true)
  let stopWatching

  const startWatching = async () => {
    if (stopWatching) stopWatching()

    if (props.id === undefined) {
      stopWatching = undefined
      value.value = undefined
    }
    else if (props.metadata) {
      const metadata = await Agent.metadata(props.id)
      value.value = props.path.length === 1 ? metadata[props.path[0]] : metadata
    } else {
      stopWatching = Agent.watch([props.id, ...props.path], v => value.value = v)
    }
    loading.value = false
  }

  watch( [() => props.id, () => props.path], startWatching, { deep: true })

  onBeforeUnmount(() => stopWatching && stopWatching())

  startWatching()

  const defaultRenderedValue = computed(() => {
    if (loading.value) return 'loading'
    else if (value.value === null && props.placeholder) return props.placeholder
    else return value.value
  })

</script>
