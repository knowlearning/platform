<template>
  <div class="wrapper">
    <img src="/free-response-icon.png" />
    <div>
      {{ prompt.slice(0, 12) }}...
    </div>
    <div>
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
  img {
    width: 32px;
  }
  .wrapper
  {
    position: absolute;
    width: 100vw;
    height: 100vh;
    text-align: center;
    overflow: hidden;
  }
</style>
