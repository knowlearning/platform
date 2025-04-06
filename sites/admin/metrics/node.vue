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
      x: [],  // Time values in date format
      y: [],  // Metric values (0 to 1)
      type: 'scatter',
      mode: 'lines', // Removes dots, keeps only the line
      line: { shape: 'spline', color: 'blue' } // Makes the line smooth
    }

    const layout = {
      title: 'Metric Over Time',
      height: 256,
      autosize: true,
      xaxis: {
        title: 'Time (HH:MM:SS)',
        type: 'date',  // Ensures correct time handling
        tickformat: '%H:%M:%S'  // Displays hours and minutes
      },
      margin: { t: 50, b: 50, l: 50, r: 50 },  // Adjust margins to give more space
      yaxis: { title: 'Metric Value', range: [0, 1] },
      showlegend: true,
      legend: {
        x: 0,
        y: 1,
        yanchor: 'bottom',
        orientation: 'h'
      }
    }

    const plotlyOptions = {
      displaylogo: false
    }

    Plotly.newPlot(cpuPlot.value, [trace], layout, plotlyOptions)

    const timeData = []
    const singleProcessData = []
    const usedMemoryData = []
    const freeMemoryData = []
    const rxData = []
    const txData = []
    const numConnectionData = []

    const memLayout = {
      title: 'Memory Usage Over Time',
      xaxis: { title: 'Time' },
      yaxis: {
        title: 'Memory (MB)',
        tickformat: '~s', // Uses SI prefixes (k, M, G, etc.)
        ticksuffix: 'B'
      },
      hovermode: 'closest',
      margin: { t: 50, b: 50, l: 50, r: 50 },  // Adjust margins to give more space
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
        tickformat: '~s', // Uses SI prefixes (k, M, G, etc.)
        ticksuffix: 'B/s'
      },
      hovermode: 'closest',
      margin: { t: 50, b: 50, l: 50, r: 50 },  // Adjust margins to give more space
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
      title: 'Connections Over Time',
      xaxis: { title: 'Time' },
      yaxis: {
        title: 'Connections'
      },
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

    const connectionTraces = [
      {
        x: timeData,
        y: numConnectionData,
        name: 'User Connections',
        mode: 'lines',
        line: { color: 'rgba(100, 200, 100, 0.6)' }
      }
    ]

    Plotly.newPlot(connectionPlot.value, connectionTraces, connectionLayout, plotlyOptions)

    function updateGraph(newTime, singleProcess, usedMemory, totalMemory, rxRate, txRate, numConnections) {
        timeData.push(newTime)
        usedMemoryData.push(usedMemory - singleProcess)
        singleProcessData.push(singleProcess)
        freeMemoryData.push(totalMemory - usedMemory)
        rxData.push(rxRate)
        txData.push(txRate)
        numConnectionData.push(numConnections)

        if (timeData.length > 100) {
          timeData.shift()
          singleProcessData.shift()
          usedMemoryData.shift()
          freeMemoryData.shift()
          rxData.shift()
          txData.shift()
          numConnectionData.shift()
        }

        Plotly.update(memPlot.value, {
            x: [timeData, timeData, timeData],
            y: [usedMemoryData, singleProcessData, freeMemoryData]
        })

        Plotly.update(netPlot.value, {
            x: [timeData, timeData],
            y: [rxData, txData]
        })

        Plotly.update(connectionPlot.value, {
            x: [timeData],
            y: [numConnectionData]
        })
    }

    Agent.watch(['metrics', session], state => {
      if (!state.process) return
      console.log(state)
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
      const numConnections = Object.keys(connections.value).length

      trace.x.push(now)
      trace.y.push(processCPU)
      console.log(trace.y)
      Plotly.update(cpuPlot.value, { x: [trace.x], y: [trace.y] })

      console.log(processMemory, totalMemory, usedMemory)

      updateGraph(now, processMemory, usedMemory, totalMemory, rx, tx, numConnections)
    }, 'node', 'core')
  })
</script>

<template>
  <div>
    <h1>Node {{session}}</h1>
    <h2>Last Ping: {{lastPingView}}</h2>
    <pre>Instance: {{instanceInfo}}</pre>
    <div ref="cpuPlot" />
    <div ref="memPlot" />
    <div ref="netPlot" />
    <div ref="connectionPlot" />
  </div>
</template>