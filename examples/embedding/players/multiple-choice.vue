<template>
  <div>
    play multiple choice...
    <button @click="close">done</button>
  </div>
</template>

<script>
  export default {
    methods: {
      close() {
        Agent.close()
      }
    }
  }
</script>

<style>
</style>
