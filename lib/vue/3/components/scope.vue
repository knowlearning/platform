<template>
  <span v-if="state">{{value}}</span>
  <span v-else>loading...</span>
</template>

<script>

  export default {
  	props: {
  	  id: String,
      path: {
        type: Array,
        default: []
      }
  	},
  	data() {
  	  return {
  	  	state: null
  	  }
  	},
    watch: {
      id() {
        this.stopWatching()
        this.startWatching()
      }
    },
    mounted() {
      this.startWatching()
  	},
    unmounted() {
      this.stopWatching()
    },
    computed: {
      value() {
        if (this.path.length === 0) return this.state

        return (
          this
            .path
            .reduce((acc, field) => acc?.[field], this.state)
        )
      }
    },
    methods: {
      startWatching() {
        this.stopWatching = Agent.watch(this.id, ({ state }) => this.state = state)
      }
    }
  }

</script>