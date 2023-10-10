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

      for (let ms=this.msMin; ms <= this.msMax; ms += this.msInterval){
        msBuckets.push(ms)
      }

      const queryData = {}

      this
        .data
        .forEach(({ query, round_trip_time, db_latency }) => {
          if (!queryData[query]) queryData[query] = {
            client_latency: new Array(msBuckets.length).fill(0),
            db_latency: new Array(msBuckets.length).fill(0)
          }

          //  TODO: decompose
          const clientLatencyBucketIndex = Math.min(
            Math.max(
              0,
              Math.round(parseInt(round_trip_time - this.msMin)/this.msInterval)
            ),
            queryData[query].client_latency.length - 1
          )
          queryData[query].client_latency[clientLatencyBucketIndex] += 1

          const dbLatencyBucketIndex = Math.min(
            Math.max(
              0,
              Math.round(parseInt(db_latency - this.msMin)/this.msInterval)
            ),
            queryData[query].db_latency.length - 1
          )
          queryData[query].db_latency[dbLatencyBucketIndex] += 1

        })

      return Object.entries(queryData).map(([ query, data ]) => {
        return {
          name: query,
          labels: msBuckets.map(x => `~${x}ms`), //  TODO: autofit/do < and > for ends
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
      this.loaded = true
    }
  }
}

</script>