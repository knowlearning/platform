<template>
  <div class="wrapper">
    <img src="/multiple-choice-icon.png" />
    <div>{{ prompt.slice(0, 12) }}...</div>
    <div v-if="selectedOptions.length === 0">
      ?
    </div>
    <div v-else-if="isCorrect">
      Woo!
    </div>
    <div v-else>
      Boo
    </div>
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
    computed: {
      selectedOptions() {
        return (
          Object
            .entries(this.selected)
            .filter(([index, isSelected]) => isSelected)
            .map(([index]) => parseInt(index))
        )
      },
      isCorrect() {
        const correctAnswers = (
          this
            .options
            .map(({ valid }, index)=> ({ valid, index }))
            .filter(({ valid }) => valid)
            .map(({ index }) => index)
        )
        const givenAnswers = this.selectedOptions

        return (
          correctAnswers.every(x => givenAnswers.includes(x))
          && givenAnswers.every(x => correctAnswers.includes(x))
        )
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
  img
  {
    width: 32px;
  }
  .wrapper
  {
    text-align: center;
  }
</style>
