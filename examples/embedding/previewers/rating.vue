<template>
  <div class="wrapper">
    <img class="icon" src="/rating-icon.png" />
    <div>
      {{ prompt.slice(0, 12) }}...
    </div>
    {{ rating === null ? '?' : rating }}
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
    }
  }
</script>

<style scoped>
  .wrapper
  {
    text-align: center;
  }
  .icon
  {
    width: 32px;
  }
</style>
