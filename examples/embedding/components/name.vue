<template>
  <span
    draggable="true"
    @dragstart="handleDragStart"
  >
    {{ metadata ? metadata.name.trim() || 'unnamed' : '...' }}
  </span>
</template>

<script>
  export default {
    props: {
      id: String
    },
    data() {
      return {
        metadata: null
      }
    },
    async created() {
      this.metadata = await Agent.metadata(this.id)
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