<template>
    <span
      draggable="true"
      :ref="el => initDraggable(el)"
    >
      {{ metadata ? metadata.name : 'loading...' }}
    </span>
</template>

<script>
export default {
  props: {
    id: {
      type: String,
      required: true
    }
  },
  data() {
    return { metadata: null }
  },
  async created() {
    try {
      await this.fetchMetadata()
    }
    catch (error) {
      setTimeout(() => this.fetchMetadata(), 1000)
    }
  },
  methods: {
    initDraggable(el) {
      if (el) {
        el.addEventListener("dragstart", event => {
          event.dataTransfer.setData("text/plain", this.id)
        })
      }
    },
    async fetchMetadata() {
      this.metadata = await Agent.metadata(this.id) || { name: 'INVALID CONTENT ID: ' + this.id }
    }
  }
}
</script>
