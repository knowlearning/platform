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
        current: null
      }
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
  }

  .node-cover
  {
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    user-select: none;
  }

  .node-cover:hover
  {
    background: rgba(0,0,0,0.1);
  }

</style>
