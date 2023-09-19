<template>
  <div>
    {{ prompt }}
    <input type="range" :min="min" :max="max" :step="step" v-model="rating" />
    {{ rating }}
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
    }
  }
</script>

<style>
</style>
