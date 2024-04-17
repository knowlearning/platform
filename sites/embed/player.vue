<template>
  <div
    id="player"
    v-if="embedding.id"
  >
    <vueEmbedComponent
      :key="embedding.id"
      :id="embedding.id"
    />
  </div>
  <div v-else>
    No content has been embedded here! {{ embedding.id }}
  </div>
</template>

<script setup>
  import { ref } from 'vue'
  import { vueEmbedComponent } from '@knowlearning/agents/vue.js'

  const props = defineProps(['id'])

  const embedding = ref(await Agent.state(props.id))
</script>

<style scoped>
  #player
  {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
  }

  #player > iframe
  {
    display: block;
    margin: 0;
  }
</style>