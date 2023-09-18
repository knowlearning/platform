<template>
  <div>
    prompt: <textarea v-model="prompt" />
    <button @click="create">create</button>
  </div>
</template>

<script>
  export default {
    data() {
      return {
        prompt: ''
      }
    },
    methods: {
      async create() {
        const id = await Agent.create({
          active_type: 'application/json;type=free-response',
          active: { prompt, type: 'free response' }
        })
        this.$emit('create', id)
      }
    }
  }
</script>

<style>
</style>
