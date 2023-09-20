<template>
  <div>
    <div
      v-for="{ x, y }, id in nodes"
      class="node"
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
        class="drag-cover"
        draggable="true"
        @dragstart="handleDragStart($event, id)"
        @dragend="dragOffset = null"
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
        dragOffset: null,
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
        let { clientX: x, clientY: y } = event
          if (this.dragOffset) {
            x -= this.dragOffset.x
            y -= this.dragOffset.y
          }

        const text = event.dataTransfer.getData("text")

        if (isUUID(text.trim())) {
          const id = text.trim()
          this.nodes[id] = { x, y }
        }
        this.dragging = null
        event.preventDefault()
        event.stopPropagation()
      },
      handleDragStart(event, id) {
        const { clientX: x, clientY: y } = event
        this.dragOffset = {
          x: x - this.nodes[id].x,
          y: y - this.nodes[id].y
        }
        //  TODO: store offset to use in this same component
        event.dataTransfer.effectAllowed = 'move'
        event.dataTransfer.setData('text/plain', id)
      }
    }
  }
</script>

<style>
  .node
  {
    transition: top 200ms, left 200ms;
  }

  .drag-cover
  {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    user-select: none;
    cursor: move;
  }

  .drag-cover:hover
  {
    background: rgba(0,0,0,0.1);
  }

</style>
