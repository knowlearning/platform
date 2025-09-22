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
      <v-btn text @click="submitQuery">
        Submit
      </v-btn>
    </v-card-actions>
  </v-card>

  <v-card v-if="response !== null" class="mt-8">
    <v-container>
      <v-btn text @click="downloadCSV">
        Download CSV
      </v-btn>
      <v-data-table sticky :items="response"></v-data-table>
    </v-container>
  </v-card>
</template>

<script setup>
import { ref, computed } from 'vue'
import { json2csvAsync } from 'json-2-csv'

// Props
const props = defineProps({
  domain: String
})

// State
const query = ref('SELECT * FROM metadata LIMIT 20')
const response = ref(null)

// Methods
async function submitQuery() {
  response.value = await Agent.query(query.value, [], props.domain)
  console.log('RESPONSE!!!!!!!!', response.value)
}

const columns = computed(() =>
  response.value && response.value.length ? Object.keys(response.value[0]) : []
)

async function downloadCSV() {
  if (!response.value || !response.value.length) return

  try {
    const csv = await json2csvAsync(response.value)
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)

    const link = document.createElement('a')
    link.href = url
    link.setAttribute('download', 'query_results.csv')
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  } catch (err) {
    console.error('Error converting to CSV:', err)
  }
}
</script>

<style scoped>
</style>
