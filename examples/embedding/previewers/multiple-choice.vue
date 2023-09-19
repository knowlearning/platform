<template>
  Multiple choice Previewer
  {{ choice ? 'Choice selected!' : 'Choice not selected...' }}
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
