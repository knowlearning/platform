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
    <component
      v-if="creating"
      :is="creatingComponent"
      @create="children.push($event)"
    />
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
  import MultipleChoiceEditor from './editors/multiple-choice.vue'
  import FreeResponseEditor from './editors/free-response.vue'
  import RatingEditor from './editors/rating.vue'

  const MULTIPLE_CHOICE_TYPE = 'application/json;type=multiple-choice'
  const FREE_RESPONSE_TYPE = 'application/json;type=free-response'
  const RATING_TYPE = 'application/json;type=rating'

  export default {
    components: {
      vueContentComponent,
      MultipleChoiceEditor,
      FreeResponseEditor,
      RatingEditor
    },
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
        creating: null,
        children: []
      }
    },
    async created() {
      this.environment = await Agent.environment()
    },
    computed: {
      types() {
        return [
          MULTIPLE_CHOICE_TYPE,
          FREE_RESPONSE_TYPE,
          RATING_TYPE
        ]
      },
      creatingComponent() {
        if (!this.creating) return null

        return {
          [MULTIPLE_CHOICE_TYPE]: MultipleChoiceEditor,
          [FREE_RESPONSE_TYPE]: FreeResponseEditor,
          [RATING_TYPE]: RatingEditor
        }[this.creating]
      }
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
