<template>
  <div>
    prompt: <textarea v-model="prompt" />
    Min: <input type="number" v-model="min" />
    Max: <input type="number" v-model="max" />
    Step: <input type="number" v-model="step" />
    <button @click="create">create</button>
  </div>
</template>

<script>
  export default {
    data() {
      return {
        prompt: '',
        min: null,
        max: null,
        step: null
      }
    },
    methods: {
      async create() {
        const { prompt, step, min, max } = this
        const id = await Agent.create({
          active_type: 'application/json;type=rating',
          active: { prompt, step, min, max }
        })
        this.$emit('create', id)
      }
    }
  }
</script>

<style>
</style>
