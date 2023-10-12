<template>
  <div v-if="loaded">
    Time Range: <flatPickr v-model="timeRange" :config="{enableTime: true, mode: 'range'}" />
    Min: <input type="range" v-model.number="msMin" step="100" min="0" max="60000" />{{msMin}}ms
    Max: <input type="range" v-model.number="msMax" step="100" min="0" max="60000" />{{msMax}}ms
    Interval: <input type="range" v-model.number="msInterval" step="1" min="1" max="200">{{msInterval}}ms
    dates: {{ new Date(startTS) }} {{ new Date(endTS) }}
    <div v-for="queryChartData in chartData">
      <h1>{{ queryChartData.name }}</h1>
      <Bar
        :key="`${startTS}:${endTS}:${msMin}:${msMax}:${msInterval}`"
        :data="queryChartData"
      />
    </div>
  </div>
  <div v-else>loading data</div>
</template>

<script>
import { Bar } from 'vue-chartjs'
import flatPickr from 'vue-flatpickr-component'

const NUM_BINS = 10

function histogramParams(data) {
    if (!Array.isArray(data) || data.length === 0) return null

    // Sort data
    data.sort((a, b) => a - b)

    // Calculate quartiles 1 and 3
    const Q1 = data[Math.floor(data.length * 0.05)]
    const Q3 = data[Math.floor(data.length * 0.95)]

    // Interquartile range
    const IQR = Q3 - Q1

    console.log('IQR', IQR, data, Q1, Q3)

    // Calculate the suggested minimum and maximum
    const min = Math.round(Math.max(data[0], Q1 - 1.5 * IQR))
    const max = Math.min(data[data.length - 1], Q3 + 1.5 * IQR)

    // Calculate the suggested interval
    const interval = math.round((max - min) / NUM_BINS)

    return {
      min,
      max: min + interval * NUM_BINS,
      interval
    }
}

// Calculated bin is allowed to go between -1 and 1 over max
// value for intervals to signal outside of range
function calculateBin(min, max, interval, value) {
  const numBins = (max-min)/interval
  const unclampedBin = Math.round(parseInt(value - min)/interval)
  return Math.min(Math.max(-1, unclampedBin), numBins)
}

export default {
  props: {
    domain: String
  },
  components: {
    Bar,
    flatPickr
  },
  data() {
    return {
      data: null,
      msMin: 100,
      msMax: 6000,
      msInterval: 100,
      timeRange: null,
      loaded: false
    }
  },
  async created() {
    this.loadData()
  },
  watch: {
    timeRange() { this.loadData() }
  },
  computed: {
    startTS() {
      if (this.timeRange === null) return Date.now() - 30 * 24 * 60 * 60 * 1000

      const startEnd = this.timeRange.split(' to ')
      if (startEnd.length === 2) {
        return new Date(startEnd[0]).getTime()
      }
      else return new Date(this.timeRange).getTime()
    },
    endTS() {
      if (this.timeRange === null) return new Date().getTime()

      const startEnd = this.timeRange.split(' to ')
      if (startEnd.length === 2) {
        return new Date(startEnd[1]).getTime()
      }
      else return new Date().getTime()
    },
    queryNames() {
      return Array.from(
        new Set(this.data.map(({ query }) => query))
      )
    },
    chartData() {
      const msBuckets = []

      const queryData = {}

      const round_trip_time_values = this.data.map(({ round_trip_time }) => round_trip_time)
      const db_latency = this.data.map(({ db_latency }) => db_latency)
      const { min, max, interval } = histogramParams([...round_trip_time_values, ...db_latency])

      msBuckets.push(`<${min}ms`)
      for (let ms=min; ms <= max; ms += interval) msBuckets.push(ms)
      msBuckets.push(`>${max}ms`)

      this
        .data
        .forEach(({ query, round_trip_time, db_latency }) => {
          if (!queryData[query]) queryData[query] = {
            client_latency: new Array(msBuckets.length).fill(0),
            db_latency: new Array(msBuckets.length).fill(0)
          }

          queryData[query].client_latency[calculateBin(min, max, interval, round_trip_time) + 1] += 1
          queryData[query].db_latency[calculateBin(min, max, interval, db_latency) + 1] += 1
        })

      const labels = (
        msBuckets
          .map((x, index) => {
            if (index === 0 || index === msBuckets.length - 1) return x
            else return `~${x}ms`
          })
      )

      return Object.entries(queryData).map(([ query, data ]) => {
        return {
          name: query,
          labels, //  TODO: autofit/do < and > for ends
          datasets: [
            {
              label: 'client latency',
              data: data.client_latency
            },{
              label: 'db latency',
              data: data.db_latency
            }
          ]
        }
      })
    }
  },
  methods: {
    async loadData() {
      this.loaded = false
      const queryDataQuery = `
        SELECT
          query,
          responded - requested AS round_trip_time,
          db_latency
        FROM queries
        WHERE responded IS NOT NULL
          AND db_latency IS NOT NULL
          AND requested > $1
          AND requested < $2
      `
      this.data = await Agent.query(queryDataQuery, [this.startTS, this.endTS], this.domain)
      this.data.forEach((entry) => {
        entry.round_trip_time = parseInt(entry.round_trip_time)
        entry.db_latency = parseInt(entry.db_latency)
      })
      this.loaded = true
    }
  }
}

</script>