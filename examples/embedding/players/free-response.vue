<template>
  <div>
    {{ prompt }}
    <textarea v-model="response" />
    <button @click="close">done</button>
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

<style>
</style>
