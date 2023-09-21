<template>
  <div class="prompt">
    {{ prompt.slice(0, 12) }}...
    <div class="checkbox">
      [{{ responded ? '✔' : ' ' }}]
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
    computed: {
      responded() {
        return this.response.trim().length > 0
      }
    }
  }
</script>

<style>
  .prompt
  {
    position: absolute;
    width: 100vw;
    height: 100vh;
    overflow: hidden;
  }
  .checkbox
  {
    position: fixed;
    bottom: 0;
    right: 0;
  }
</style>
