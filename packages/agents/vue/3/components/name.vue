<template>
  <span
    draggable="true"
    @dragstart="handleDragStart"
  >
    {{ loading ? '...' : name }}
  </span>
</template>

<script>
  export default {
    props: {
      id: String
    },
    data() {
      return {
        loading: true,
        metadata: null
      }
    },
    async created() {
      this.metadata = await Agent.metadata(this.id)
      this.loading = false
    },
    computed: {
      name() {
        if (this.loading) return
        else return this.metadata && this.metadata.name ? this.metadata.name : 'unnamed'
      }
    },
    methods: {
      handleDragStart(e) {
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.id);
      }
    }
  }
</script>

<style>
  span
  {
    cursor: grab;
  }
</style>