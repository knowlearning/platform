<template>
  <div v-if="type">
    Some {{ type }} Question!!!!
  </div>
  <div v-else-if="environment" class="wrapper">
    <h2>Context</h2>
    {{ '/' + environment.context.join('/') }}
    <h2>Children</h2>
    <table>
      <tbody>
        <tr
          v-for="id, index in children"
          :key="id"
          :class="{ selected: current === id }"
        >
          <td @click="select(id)">{{id}}</td>
          <td><button @click="removeTake(index)">x</button></td>
        </tr>
      </tbody>
    </table>
    <button
      v-for="type in types"
      :key="type"
      @click="startCreating(type)"
    >
      new {{ type }}
    </button>
    <button @click="openTest">test</button>
    <div v-if="creating">
      TODO: help create! {{ creating }}
      <button @click="create">create</button>
    </div>
    <vueContentComponent
      v-else-if="current"
      :key="current"
      :id="current"
    />
  </div>
</template>

<script>
  import { v4 as uuid } from 'uuid'
  import { browserAgent, vueContentComponent } from '@knowlearning/agents'

  export default {
    components: { vueContentComponent },
    props: {
      type: {
        type: String,
        required: false
      }
    },
    data() {
      return {
        current: null,
        environment: null,
        types: [
          'multiple choice',
          'free response',
          'rating'
        ],
        creating: null,
        children: []
      }
    },
    async created() {
      this.environment = await Agent.environment()
    },
    methods: {
      async startCreating(type) {
        this.current = null
        this.creating = type === this.creating ? null : type
      },
      async create() {
        const id = await Agent.create({
          active: { type: this.creating }
        })
        this.creating = null
        this.children.push(id)
        this.current = id
      },
      select(id) {
        this.creating = null
        this.current = this.current === id ? null : id
      },
      openTest() {
        this.children.push('https://test.knowlearning.systems')
      },
      removeTake(index) {
        if (this.children[index] === this.current) this.current = null
        this.children.splice(index, 1)
      }
    }
  }
</script>

<style>
  .wrapper
  {
    padding-left: 2em;
  }
  .selected
  {
    background: yellow;
  }
  tr
  {
    cursor: pointer;
  }
</style>
