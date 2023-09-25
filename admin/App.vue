<template>
  <button @click="count += 1">Add to the Count (current count: {{ count }})</button>
  <img
    v-for="n in count"
    :key="n"
    src="/knowlearning.png"
    @click="count -= 1"
  />
</template>

<script>
  export default {
    data() {
      return {
        count: 0
      }
    }
  }
</script>

<style scoped>

  img {
    width: 16px;
    height: 16px;
    margin: 4px;
  }

</style>
