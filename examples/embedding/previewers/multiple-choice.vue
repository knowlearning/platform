<template>
  <div>
    Multiple choice Previewer
    {{ choice ? 'Choice selected!' : 'Choice not selected...' }}
  </div>
</template>

<script>
  export default {
    data() {
      return {
        choice: null
      }
    }
  }
</script>

<style>
</style>
