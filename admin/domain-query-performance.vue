<template>
  <Bar v-if="data" :data="chartData" />
  <div v-else>loading data</div>
</template>

<script>
import { Bar } from 'vue-chartjs'
import { Chart as ChartJS, Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale } from 'chart.js'
import autocolors from 'chartjs-plugin-autocolors';

ChartJS.register(Title, Tooltip, Legend, BarElement, CategoryScale, LinearScale, autocolors)

const queryDataQuery = `
  SELECT
    query,
    responded - requested AS round_trip_time
  FROM queries
  WHERE responded IS NOT NULL
`

export default {
  props: {
    domain: String
  },
  components: {
    Bar
  },
  data() {
    return {
      data: null
    }
  },
  async created() {
    this.data = await Agent.query(queryDataQuery, [], this.domain)
  },
  computed: {
    chartData() {
      const msBuckets = []
      const msInterval = 100
      const maxMsBucket = 6000
      for (let ms=100; ms <= maxMsBucket; ms += msInterval) msBuckets.push(ms)

      const queryData = {}

      this
        .data
        .forEach(({ query, round_trip_time }) => {
          if (!queryData[query]) queryData[query] = new Array(msBuckets.length).fill(0)
          const bucketIndex = Math.round(parseInt(round_trip_time)/msInterval)
          queryData[query][bucketIndex] += 1
        })

      return {
        labels: msBuckets.map(x => `~${x}ms`),
        datasets: Object.keys(queryData).map(label => ({
          label,
          data: queryData[label]
        }))
      }
    },
  }
}

</script>