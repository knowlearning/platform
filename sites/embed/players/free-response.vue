<template>
  <div class="wrapper">
    <div>
      <h3>{{ prompt }}</h3>
    </div>
    <div>
      <textarea v-model="response" />
    </div>
    <div>
      <button @click="close">done</button>
    </div>
  </div>
</template>

<script>
  export default {
    props: {
      prompt: String
    },
    data() {
      return {
        response: ''
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
