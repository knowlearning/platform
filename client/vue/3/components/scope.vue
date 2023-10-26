<template>
  <span v-if="value">{{ value === null && placeholder ? placeholder : value }}</span>
  <span v-else>loading...</span>
</template>

<script>

  export default {
  	props: {
  	  id: String,
      path: { type: Array, default: [] },
      placeholder: { type: String, default: '' }
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
    unmounted() {
      if (this.startWatching) this.stopWatching()
    },
    methods: {
      startWatching() {
        if (this.startWatching) this.stopWatching()
        this.stopWatching = Agent.watch([this.id, ...path], value => this.value = value)
      }
    }
  }

</script>