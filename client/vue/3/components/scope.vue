<template>
  <span v-if="value">{{ value === null && placeholder ? placeholder : value }}</span>
  <span v-else>loading...</span>
</template>

<script>

  export default {
  	props: {
  	  id: String,
      path: { type: Array, default: [] },
      placeholder: { type: String, default: '' },
      metadata: { type: Boolean, default: false }
  	},
  	data() {
  	  return {
  	  	value: undefined
  	  }
  	},
    watch: {
      id() { this.startWatching() },
      path: { 
        deep: true,
        handler() { this.startWatching() }
      }
    },
    created() { this.startWatching() },
    beforeUnmount() {
      if (this.stopWatching) {
        this.stopWatchingAttempted = true
        this.stopWatching()
      }
    },
    methods: {
      async startWatching() {
        if (this.stopWatching) this.stopWatching()
        if (this.metadata) {
          const metadata = await Agent.metadata(this.id)
          this.value = this.path.length === 1 ? metadata[this.path[0]] : metadata
        }
        else this.stopWatching = Agent.watch([this.id, ...this.path], value => {
          if (this.stopWatchingAttempted) console.warn('Watcher not stopped for vueScopeComponent')
          else this.value = value
        })
      }
    }
  }

</script>