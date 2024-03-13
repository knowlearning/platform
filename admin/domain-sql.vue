<template>
  <v-card>
    <v-card-title>PostgreSQL</v-card-title>
    <v-card-text>
      <v-textarea
        label="Query"
        v-model="query"
        @keypress.shift.enter.prevent="submitQuery"
      />
    </v-card-text>
    <v-card-actions right>
      <v-btn
        text
        @click="submitQuery"
      >
        Submit
      </v-btn>
    </v-card-actions>
  </v-card>
  <v-card
    v-if="response !== null"
    class="mt-8"
  >
    <v-container>
      <v-data-table sticky :items="response"></v-data-table>
    </v-container>
  </v-card>
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