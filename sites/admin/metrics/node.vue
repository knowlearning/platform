<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import Plotly from 'plotly.js-dist'
  import dayjs from 'dayjs'
  import relativeTime from 'dayjs/plugin/relativeTime'

  dayjs.extend(relativeTime)

  const { session } = defineProps({
    session: String
  })

  const cpuPlot = ref(null)
  const memPlot = ref(null)
  const netPlot = ref(null)
  const connectionPlot = ref(null)

  const instanceInfo = ref(null)
  const websocketInfo = ref(null)
  const lastPing = ref(null)
  const connections = ref(null)

  const lastPingView = ref(null)

  function updateLastPingView() {
    lastPingView.value = dayjs(lastPing.value).fromNow()
    setTimeout(updateLastPingView, 1000)
  }

  updateLastPingView()

  onMounted(() => {
    const trace = {
      name: 'CPU Utilization',
      x: [],
      y: [],
      type: 'scatter',
      mode: 'lines',
      line: { shape: 'spline', color: 'blue' }
    }

    const layout = {
      title: 'Metric Over Time',
      height: 256,
      autosize: true,
      xaxis: {
        title: 'Time (HH:MM:SS)',
        type: 'date',
        tickformat: '%H:%M:%S'
      },
      margin: { t: 50, b: 50, l: 50, r: 50 },
      yaxis: { title: 'Metric Value', range: [0, 1] },
      showlegend: true,
      legend: {
        x: 0,
        y: 1,
        yanchor: 'bottom',
        orientation: 'h'
      }
    }

    const plotlyOptions = { displaylogo: false }

    Plotly.newPlot(cpuPlot.value, [trace], layout, plotlyOptions)

    const timeData = []
    const singleProcessData = []
    const usedMemoryData = []
    const freeMemoryData = []
    const rxData = []
    const txData = []

    // connections per domain
    const domainData = reactive({})  // domain -> { x: [], y: [] }

    const memLayout = {
      title: 'Memory Usage Over Time',
      xaxis: { title: 'Time' },
      yaxis: {
        title: 'Memory (MB)',
        tickformat: '~s',
        ticksuffix: 'B'
      },
      hovermode: 'closest',
      margin: { t: 50, b: 50, l: 50, r: 50 },
      legend: {
        x: 0,
        y: 1,
        yanchor: 'bottom',
        orientation: 'h'
      }
    }

    const memTraces = [
      {
        x: timeData,
        y: usedMemoryData,
        name: 'Used Memory',
        fill: 'tozeroy',
        mode: 'none',
        stackgroup: 'one',
        line: { color: 'rgba(100, 200, 100, 0.6)' }
      },
      {
        x: timeData,
        y: singleProcessData,
        name: 'Process Memory',
        fill: 'tonexty',
        mode: 'none',
        stackgroup: 'one',
        line: { color: 'rgba(200, 100, 100, 0.6)' }
      },
      {
        x: timeData,
        y: freeMemoryData,
        stackgroup: 'one',
        mode: 'none',
        fill: 'tonexty',
        name: 'Free Memory'
      }
    ]

    Plotly.newPlot(memPlot.value, memTraces, memLayout, plotlyOptions)

    const netLayout = {
      title: 'Network Usage Over Time',
      xaxis: { title: 'Time' },
      yaxis: {
        title: 'Network (bytes/s)',
        tickformat: '~s',
        ticksuffix: 'B/s'
      },
      hovermode: 'closest',
      margin: { t: 50, b: 50, l: 50, r: 50 },
      legend: {
        x: 0,
        y: 1,
        yanchor: 'bottom',
        orientation: 'h'
      }
    }

    const netTraces = [
      {
        x: timeData,
        y: rxData,
        name: 'Inbound Data',
        mode: 'lines',
        line: { color: 'rgba(100, 200, 100, 0.6)' }
      },
      {
        x: timeData,
        y: txData,
        name: 'Outbound Data',
        mode: 'lines',
        line: { color: 'rgba(200, 100, 100, 0.6)' }
      }
    ]

    Plotly.newPlot(netPlot.value, netTraces, netLayout, plotlyOptions)

    const connectionLayout = {
      title: 'Connections Over Time (per Domain)',
      xaxis: { title: 'Time' },
      yaxis: { title: 'Users' },
      hovermode: 'closest',
      showlegend: true,
      margin: { t: 50, b: 50, l: 50, r: 50 },
      legend: {
        x: 0,
        y: 1,
        yanchor: 'bottom',
        orientation: 'h'
      }
    }

    Plotly.newPlot(connectionPlot.value, [], connectionLayout, plotlyOptions)

    function updateGraph(newTime, singleProcess, usedMemory, totalMemory, rxRate, txRate, connectionsObj) {
      timeData.push(newTime)
      usedMemoryData.push(usedMemory - singleProcess)
      singleProcessData.push(singleProcess)
      freeMemoryData.push(totalMemory - usedMemory)
      rxData.push(rxRate)
      txData.push(txRate)

      // count sessions per domain
      const domainCounts = {}
      Object.values(connectionsObj).forEach(({ domain }) => {
        if (!domain) return
        domainCounts[domain] = (domainCounts[domain] || 0) + 1
      })

      // update per-domain traces
      for (const [domain, count] of Object.entries(domainCounts)) {
        if (!domainData[domain]) {
          domainData[domain] = { x: [], y: [] }
          Plotly.addTraces(connectionPlot.value, {
            x: domainData[domain].x,
            y: domainData[domain].y,
            name: domain,
            mode: 'none',
            stackgroup: 'one',
            fill: 'tonexty'
          })
        }
        domainData[domain].x.push(newTime)
        domainData[domain].y.push(count)

        if (domainData[domain].x.length > 100) {
          domainData[domain].x.shift()
          domainData[domain].y.shift()
        }
      }

      if (timeData.length > 100) {
        timeData.shift()
        singleProcessData.shift()
        usedMemoryData.shift()
        freeMemoryData.shift()
        rxData.shift()
        txData.shift()
      }

      Plotly.update(memPlot.value, {
        x: [timeData, timeData, timeData],
        y: [usedMemoryData, singleProcessData, freeMemoryData]
      })

      Plotly.update(netPlot.value, {
        x: [timeData, timeData],
        y: [rxData, txData]
      })

      // update all domain traces at once
      const xs = []
      const ys = []
      for (const d in domainData) {
        xs.push(domainData[d].x)
        ys.push(domainData[d].y)
      }
      Plotly.update(connectionPlot.value, { x: xs, y: ys })
    }


    Agent.watch(['metrics', session], state => {
      if (!state.process) return

      const now = new Date()

      const {
        processCPU,
        processMemory,
        totalMemory,
        usedMemory
      } = state.process || {}

      const { rx, tx } = state.network || { rx: 0, tx: 0 }

      lastPing.value = state.ping
      connections.value = state.connections || {}
      instanceInfo.value = state.instance
      websocketInfo.value = state.websockets

      trace.x.push(now)
      trace.y.push(processCPU)
      Plotly.update(cpuPlot.value, { x: [trace.x], y: [trace.y] })

      updateGraph(now, processMemory, usedMemory, totalMemory, rx, tx, connections.value)
    }, 'node', 'core')
  })
</script>

<template>
  <div>
    <h1>Node {{session}}</h1>
    <h2>Last Ping: {{lastPingView}}</h2>
    <pre>Instance: {{instanceInfo}}</pre>
    <pre>Websockets: {{websocketInfo}}</pre>
    <div ref="cpuPlot" />
    <div ref="memPlot" />
    <div ref="netPlot" />
    <div ref="connectionPlot" />
  </div>
</template>
