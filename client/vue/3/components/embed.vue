<template>
  <iframe
    :v-if="resolvedId"
    :key="resolvedId + mode"
    :ref="el => setup(el, resolvedId, mode)"
    style="
      width: 100%;
      height: 100%;
      border: none;
    "
    allow="camera;microphone"
  />
</template>

<script>
export default {
  props: {
    id: {
      type: String,
      required: true
    },
    path: {
      type: Array,
      default: []
    },
    mode: {
      type: String,
      required: false
    },
    environmentProxy: {
      type: Function,
      required: false
    }
  },
  data() {
    return {
      resolvedId: null
    }
  },
  async created() {
    this.startWatching()
  },
  watch: {
    id() { this.startWatching() },
    path: { deep: true, handler() { this.startWatching() } }
  },
  unmounted() {
    if (this.embedding) this.embedding.remove()
  },
  methods: {
    startWatching() {
      if (this.stopWatching) this.stopWatching()
      if (this.path.length) {
        this.stopWatching = Agent.watch([this.id, ...this.path], value => {
          //  TODO: ensure resolved value is uuid or URL
          this.resolvedId = value
        })
      }
      else this.resolvedId = this.id
    },
    async setup(iframe, id, mode) {
      if (!iframe || this.iframe === iframe) return

      this.iframe = iframe
      this.embedding = Agent.embed({ id, mode }, iframe)
      this.embedding.on('environment', e => this.environmentProxy ? this.environmentProxy(e) : Agent.environment(e))
      this.embedding.on('state', e => this.$emit('state', e))
      this.embedding.on('mutate', e => this.$emit('mutate', e))
      this.embedding.on('close', e => this.$emit('close', e))
    }
  }
}

</script>
