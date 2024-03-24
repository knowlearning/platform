<template>
  <div>
    prompt: <textarea v-model="prompt" />
    <button @click="create">create</button>
  </div>
</template>

<script>
  import { FREE_RESPONSE_TYPE } from '../types.js'

  export default {
    data() {
      return {
        prompt: ''
      }
    },
    methods: {
      async create() {
        const id = await Agent.create({
          active_type: FREE_RESPONSE_TYPE,
          active: { prompt: this.prompt, type: 'free response' }
        })
        this.$emit('create', id)
      }
    }
  }
</script>

<style>
</style>
