<template>
  <div>
    <v-textarea
      label="Postgres SQL Query"
      v-model="query"
    />
    <v-btn @click="submitQuery">submit</v-btn>
    <div v-if="response === null"></div>
    <div v-else>
      <v-container>
        <v-data-table sticky :items="response"></v-data-table>
      </v-container>
    </div>
  </div>
</template>

<script>

  export default {
    props: {
      domain: String
    },
    data() {
      return {
        query: 'SELECT * FROM metadata LIMIT 20',
        response: null
      }
    },
    methods: {
      async submitQuery() {
        this.response = await Agent.query(this.query, [], this.domain)
        console.log('RESPONSE!!!!!!!!', this.response)
      }
    },
    computed: {
      columns() {
        return this.response && this.response.length ? Object.keys(this.response[0]) : []
      }
    }
  }

</script>

<style scoped>
</style>