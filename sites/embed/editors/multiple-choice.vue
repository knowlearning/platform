<template>
  <div>
    prompt: <textarea type="text" v-model="prompt" />
    <div v-for="option, index in options">
      <input
        type="checkbox"
        v-model="options[index].valid"
      />
      <input
        type="text"
        v-model="options[index].text"
      />
      <button @click="options.splice(index, 1)">x
      </button>
    </div>
    <button @click="options.push({text: ''})">+ option</button>
    <hr>
    <button @click="create">create</button>
  </div>
</template>

<script>
  import { MULTIPLE_CHOICE_TYPE } from '../types.js'
  export default {
    data() {
      return {
        prompt: '',
        options: []
      }
    },
    methods: {
      async create() {
        //  TODO: probably want to encode the answer so only someone with the key can decode it
        const { prompt, options } = this
        const id = await Agent.create({
          active_type: MULTIPLE_CHOICE_TYPE,
          active: { prompt, options }
        })
        this.$emit('create', id)
      }
    }
  }
</script>

<style>
</style>
