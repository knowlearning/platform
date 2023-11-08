<template>
  <div class="wrapper">
    <div>
      <h3>{{ prompt }}</h3>
    </div>
    <div>
      <input type="range" :min="min" :max="max" :step="step" v-model.number="rating" />
      {{ rating }}
    </div>
    <div>
      <button @click="close">done</button>
    </div>
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

<style scoped>
  .wrapper
  {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 16px;
    background: gainsboro;
  }
  textarea
  {
    height: 33vh;
  }
</style>
