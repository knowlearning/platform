<template>
  <div>
    {{ prompt }}
    <textarea v-model="response" />
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
    }
  }
</script>

<style>
</style>
