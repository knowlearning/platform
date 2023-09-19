<template>
  edit multiple choice...
  <button @click="create">create</button>
</template>

<script>
  import { MULTIPLE_CHOICE_TYPE } from '../types.js'
  export default {
    methods: {
      async create() {
        //  TODO: probably want to encode the answer so only someone with the key can decode it
        const id = await Agent.create({
          active_type: MULTIPLE_CHOICE_TYPE,
          active: { choices: ['a choice', 'second choice', 'another choice'], answer: 1 }
        })
        this.$emit('create', id)
      }
    }
  }
</script>

<style>
</style>
