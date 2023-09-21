<template>
  <div class="wrapper">
    <h3>{{ prompt }}</h3>
    <div
      v-for="{ text }, index in options"
      :key="index"
    >
      <input
        type="checkbox"
        v-model="selected[index]"
      />
      {{ text }}
    </div>
    <button @click="close">done</button>
  </div>
</template>

<script>
  export default {
    props: {
      options: Array,
      prompt: String
    },
    data() {
      return {
        selected: {}
      }
    },
    methods: {
      close() {
        Agent.close()
      }
    }
  }
</script>

<style scoped>
  .wrapper
  {
    display: flex;
    flex-direction: column;
    justify-content: center;
    align-items: center;
    padding: 16px;
    background: gainsboro;
  }
</style>
