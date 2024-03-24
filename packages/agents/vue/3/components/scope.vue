<template>
  <slot :loading="loading" :value="value">
    <span v-if="loading">loading...</span>
    <span v-else>{{ value === null && placeholder ? placeholder : value }}</span>
  </slot>
</template>

<script>
import { ref, watch, onMounted, onBeforeUnmount } from 'vue'

export default {
  props: {
    id: String,
    path: { type: Array, default: [] },
    placeholder: { type: String, default: '' },
    metadata: { type: Boolean, default: false }
  },
  setup(props) {
    const value = ref(undefined)
    const loading = ref(true)
    let stopWatching
    let stopWatchingAttempted = false

    const startWatching = async () => {
      if (stopWatching) stopWatching()
      if (props.metadata) {
        const metadata = await Agent.metadata(props.id)
        value.value = props.path.length === 1 ? metadata[props.path[0]] : metadata
      } else {
        stopWatching = Agent.watch([props.id, ...props.path], val => {
          if (stopWatchingAttempted) console.warn('Watcher not stopped for vueScopeComponent')
          else  value.value = val
        })
      }
      loading.value = false
    }

    watch( [() => props.id, () => props.path], startWatching, { deep: true })
    onMounted(() => startWatching())
    onBeforeUnmount(() => stopWatching && stopWatching())

    return { loading, value }
  }
};
</script>
