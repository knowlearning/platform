<template>
  <div>
    editor
  </div>
</template>

<script>
  import { validate as isUUID } from 'uuid'
  import { browserAgent, vueContentComponent } from '@knowlearning/agents'

  export default {
    created() {
      window.addEventListener('dragover', this.handleDragover)
      window.addEventListener('drop', this.handleDrop)
    },
    methods: {
      handleDragover(event) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      },
      async handleDrop(event) {
        const { clientX, clientY } = event

        const text = event.dataTransfer.getData("text")

        if (isUUID(text.trim())) {
          alert('UUID drop!' + text)
        }
        this.dragging = null
        event.preventDefault()
        event.stopPropagation()
      }
    }
  }
</script>

<style>
</style>
