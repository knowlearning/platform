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
          <td @click="select(id)">
            <vueNameComponent :id="id" />
          </td>
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
      <div>
        name:
        <input type="text" v-model="newItemName" />
      </div>
      <component
        :is="editors[creating]"
        @create="create"
      />
    </div>
    <vueEmbedComponent
      v-else-if="current"
      :key="current"
      :id="current"
    />
  </div>
</template>

<script>
  import { v4 as uuid } from 'uuid'
  import { browserAgent } from '@knowlearning/agents'
  import { vueEmbedComponent, vueNameComponent } from '@knowlearning/agents/vue.js'

  import MultipleChoiceEditor from './editors/multiple-choice.vue'
  import FreeResponseEditor from './editors/free-response.vue'
  import RatingEditor from './editors/rating.vue'

  import { MULTIPLE_CHOICE_TYPE, FREE_RESPONSE_TYPE, RATING_TYPE } from './types.js'

  export default {
    components: {
      vueEmbedComponent,
      vueNameComponent,
      MultipleChoiceEditor,
      FreeResponseEditor,
      RatingEditor
    },
    props: {
      id: String,
      active_type: String
    },
    data() {
      return {
        current: null,
        newItemName: 'New Item',
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
      editors() {
        return {
          [MULTIPLE_CHOICE_TYPE]: MultipleChoiceEditor,
          [FREE_RESPONSE_TYPE]: FreeResponseEditor,
          [RATING_TYPE]: RatingEditor
        }
      }
    },
    methods: {
      async startCreating(type) {
        this.newItemName = 'New Item'
        this.current = null
        this.creating = type === this.creating ? null : type
      },
      async create(id) {
        const md = await Agent.metadata(id)
        md.name = this.newItemName
        this.newItemName = 'New Item'
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
