<template>
  <div>
    <h1>
      Tables
      <button @click="createTable">+</button>
    </h1>
    <div v-for="columnInfo, tableName in tables">
      <h2>
        {{ tableName }}
        <button @click="removeTable(tableName)">x</button>
      </h2>
      <table>
        <tr>
          <th>owner</th>
          <th>id</th>
          <th>updated</th>
          <th v-for="columnType, columnName in columnInfo">
            {{ columnName }} ({{ columnType }})
            <button @click="removeColumn(tableName, columnName)">x</button>
          </th>
          <th>
            <button @click="addColumn(tableName)">+</button>
          </th>
        </tr>
      </table>
    </div>
    <h1>
      Functions
      <button @click="createFunction">+</button>
    </h1>
    <div v-for="fn, functionName in functions">
      <h2>
        {{ functionName }}
        <button @click="delete functions[functionName]">x</button>
      </h2>
      Returns: <TypeSelecter v-model="fn.type" />
      Language:
      <select v-model="fn.language">
        <option>PLpgSQL</option>
      </select>
      Arguments:
      <div v-for="argument, i in fn.arguments">
        <button @click="addArgument(fn.arguments, i)">+</button>
        (
          name: <input v-model="argument.name" />
          type: <TypeSelecter v-model="argument.type" />
          <button @click="removeArgument(fn.arguments, i)">x</button>
        )
      </div>
      <button @click="addArgument(fn.arguments, fn.arguments.length)">+</button>
      <br>
      Body: <textarea v-model="fn.body" />
    </div>
    <h1>
      Scopes
      <button @click="createComputedScope">+</button>
    </h1>
    <div v-for="_, scopeName in scopes">
      <h2>
        {{ scopeName }}
        <button @click="delete scopes[scopeName]">x</button>
      </h2>
      <textarea v-model="scopes[scopeName]" />
    </div>
  </div>
</template>

<script>
import TypeSelecter from './type-selecter.vue'

const VALID_TYPES = ['integer', 'string', 'boolean']

export default {
  components: {
    TypeSelecter
  },
  props: {
    domain: String,
    config: Object
  },
  computed: {
    tables() { return this.config.tables },
    scopes() { return this.config.scopes },
    functions() { return this.config.functions }
  },
  methods: {
    createTable() {
      const name = prompt('Table Name:')
      if (name === null) return
      if (this.tables[name]) return alert(`Table "${name}" already exists.`)

      this.tables[name] = {}
    },
    createFunction() {
      const name = prompt('Function Name:')
      if (name === null) return
      if (this.functions[name]) return alert(`Table "${name}" already exists.`)

      this.functions[name] = {
        language: 'PLpgSQL',
        arguments: [],
        type: 'BOOLEAN',
        body: 'BEGIN\n  RETURN TRUE;\nEND;'
      }
    },
    addColumn(table) {
      const name = prompt('Column Name:')
      if (!name) return
      if (this.tables[table][name]) return alert(`Column "${name}" already exists`)
      const type = prompt('Column Type:')
      if (!type) return
      if (!VALID_TYPES.includes(type)) return alert(`"${type}" is invalid. Valid types are: ${VALID_TYPES.join(' ')}`)

      this.tables[table][name] = type
    },
    addArgument(list, index) {
      // TODO: remove this copy hack once the core bug about inserting mutable state inside of lists is fixed
      const copy = JSON.parse(JSON.stringify(list))
      copy.splice(index, 0, { name: 'name', type: 'BOOLEAN' })
      list.splice(0, list.length, ...copy)
    },
    removeArgument(list, index) {
      // TODO: remove this copy hack once the core bug about inserting mutable state inside of lists is fixed
      const copy = JSON.parse(JSON.stringify(list))
      copy.splice(index, 1)
      list.splice(0, list.length, ...copy)
    },
    removeTable(table) {
      delete this.tables[table]
    },
    removeColumn(table, column) {
      delete this.tables[table][column]
    },
    createComputedScope() {
      const name = prompt('Scope Name:')
      if (name === null) return
      if (this.scopes[name]) return alert(`Computed Scope "${name}" already exists.`)

      this.scopes[name] = ''
    }
  }
}

</script>

<style scoped>


th, td {
  text-align: left;
  padding: 4px 16px;
}

</style>
