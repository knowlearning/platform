<template>
  <div v-if="environment" class="wrapper">
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
          <td @click="current = current === id ? null : id">{{id}}</td>
          <td><button @click="removeTake(index)">x</button></td>
        </tr>
      </tbody>
    </table>
    <button @click="createContent">new</button>
    <button @click="openTest">test</button>
    <vueContentComponent
      v-if="current"
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
    data() {
      return {
        current: null,
        environment: null,
        children: []
      }
    },
    async created() {
      this.environment = await Agent.environment()
    },
    methods: {
      async createContent() {
        const id = await Agent.create({
          active_type: 'application/json;type=demo-stats',
          active: {
            time: 0,
            progress: 0,
            score: 0,
            success: null,
            scope: uuid(),
            content: null,
            parent: null
          }
        })
        this.children.push(id)
      },
      openTest() {
        this.children.push('https://localhost:5174')
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
