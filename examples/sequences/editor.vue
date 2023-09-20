<template>
  <div>
    <div
      v-for="{ x, y }, id in nodes"
      :key="id"
      :style="{
        position: 'absolute',
        left: `${x}px`,
        top: `${y}px`,
        width: '100px',
        height: '100px'
      }"
    >
      <vueContentComponent
        :id="id"
        mode="preview"
      />
      <div
        class="preview-drag-cover"
        draggable="true"
        @dragstart="handleDragStart($event, id)"
      />
    </div>
  </div>
</template>

<script>
  import { validate as isUUID } from 'uuid'
  import { browserAgent, vueContentComponent } from '@knowlearning/agents'

  export default {
    components: {
      vueContentComponent
    },
    created() {
      window.addEventListener('dragover', this.handleDragover)
      window.addEventListener('drop', this.handleDrop)
    },
    data() {
      return {
        nodes: {},
        edges: {}
      }
    },
    methods: {
      handleDragover(event) {
        event.preventDefault()
        event.dataTransfer.dropEffect = 'move'
      },
      async handleDrop(event) {
        const { clientX: x, clientY: y } = event

        const text = event.dataTransfer.getData("text")

        if (isUUID(text.trim())) {
          const id = text.trim()
          this.nodes[id] = { x, y }
        }
        this.dragging = null
        event.preventDefault()
        event.stopPropagation()
      },
      handleDragStart(e, id) {
        //  TODO: store offset to use in this same component
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', id);
      }
    }
  }
</script>

<style>
  .preview-drag-cover
  {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    user-select: none;
    cursor: move;
  }

  .preview-drag-cover:hover
  {
    background: rgba(0,0,0,0.1);
  }

</style>
