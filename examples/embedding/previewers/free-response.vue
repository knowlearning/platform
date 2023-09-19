<template>
  <div>
    Free response question preview!
    {{ response.trim().length ? 'You responded!' : 'No response yet' }}
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
