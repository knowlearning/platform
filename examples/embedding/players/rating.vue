<template>
  <div>
    {{ prompt }}
    <input type="range" :min="min" :max="max" :step="step" v-model="rating" />
    {{ rating }}
    <button @click="close">done</button>
  </div>
</template>

<script>
  export default {
    props: {
      prompt: String,
      min: Number,
      max: Number,
      step: Number
    },
    data() {
      return {
        response: '',
        rating: null
      }
    },
    methods: {
      close() {
        Agent.close()
      }
    }
  }
</script>

<style>
</style>
