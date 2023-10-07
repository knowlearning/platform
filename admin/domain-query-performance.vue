<template>
  <div v-if="data">
    Time Range: <flatPickr v-model="timeRange" :config="{enableTime: true, mode: 'range'}" />
    Min: <input type="range" v-model.number="msMin" step="100" min="0" max="60000" />{{msMin}}ms
    Max: <input type="range" v-model.number="msMax" step="100" min="0" max="60000" />{{msMax}}ms
    Interval: <input type="range" v-model.number="msInterval">{{msInterval}}ms
    dates: {{ new Date(startTS) }} {{ new Date(endTS) }}
    <Bar
      v-if="loaded"
      :key="`${startTS}:${endTS}:${msMin}:${msMax}:${msInterval}`"
      :data="chartData"
    />
    <div v-else>Loading...</div>
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
    chartData() {
      const msBuckets = []

      for (let ms=this.msMin; ms <= this.msMax; ms += this.msInterval){
        msBuckets.push(ms)
      }

      const queryData = {}

      this
        .data
        .forEach(({ query, round_trip_time }) => {
          if (!queryData[query]) queryData[query] = new Array(msBuckets.length).fill(0)
          const bucketIndex = Math.min(
            Math.max(
              0,
              Math.round(parseInt(round_trip_time - this.msMin)/this.msInterval)
            ),
            queryData[query].length - 1
          )
          queryData[query][bucketIndex] += 1
        })

      return {
        labels: msBuckets.map(x => `~${x}ms`),
        datasets: Object.keys(queryData).map(label => ({
          label,
          data: queryData[label]
        }))
      }
    }
  },
  methods: {
    async loadData() {
      this.loaded = false
      const queryDataQuery = `
        SELECT
          query,
          responded - requested AS round_trip_time
        FROM queries
        WHERE responded IS NOT NULL
          AND requested > $1
          AND requested < $2
      `
      this.data = await Agent.query(queryDataQuery, [this.startTS, this.endTS], this.domain)
      this.loaded = true
    }
  }
}

</script>