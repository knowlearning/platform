<template>
  <vueEmbedComponent
    v-if="current"
    :id="current"
    @close="current = null"
  />
  <div
    class="wrapper"
    v-else
  >
    <button @click="close">done</button>
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
      <vueEmbedComponent
        :id="id"
        mode="preview"
      />
      <div
        class="node-cover"
        @click="open(id)"
      />
    </div>
  </div>
</template>

<script>
  import { validate as isUUID } from 'uuid'
  //  TODO: separate vue into different package. ie: @knowlearning/frameworks/vue.js
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'

  export default {
    props: {
      nodes: Object,
      edges: Object
    },
    components: {
      vueEmbedComponent
    },
    data() {
      return {
        current: null,
        taskTimes: {}
      }
    },
    created() {
      let lastUpdate = Date.now()
      let elapsed = 0

      const updateTaskTime = () => {
        const now = Date.now()
        elapsed += now - lastUpdate
        lastUpdate = now

        const key = this.current || "map"
        while (elapsed >= 1000) {
          if (!this.taskTimes[key]) this.taskTimes[key] = 0
          this.taskTimes[key] += 1
          elapsed -= 1000
        }
        console.log(key, this.taskTimes[key])
        setTimeout(updateTaskTime, 100)
      }

      setTimeout(updateTaskTime, 100)
    },
    methods: {
      open(id) {
        this.current = id
      },
      close() {
        Agent.close()
      },
    }
  }
</script>

<style>
  .node
  {
    transition: top 200ms, left 200ms;
    border-radius: 16px;
    border: 1px solid #EEEEEE;
    box-shadow: rgba(0, 0, 0, 0.24) 0px 8px 8px;
  }

  .node-cover
  {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    border-radius: 16px;
    user-select: none;
    cursor: pointer;
  }

  .node-cover:hover
  {
    opacity: 1;
    box-shadow: rgba(0, 0, 0, 0.24) 0px 3px 8px;
  }

</style>
