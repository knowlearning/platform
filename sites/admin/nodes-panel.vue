<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import Plotly from 'plotly.js-dist'

  const cpuPlot = ref(null)
  const memPlot = ref(null)
  const data = reactive({})

  onMounted(() => {
    if (cpuPlot.value) {

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

      function updateGraph(newTime, singleProcess, usedMemory, totalMemory) {
          timeData.push(newTime)
          usedMemoryData.push(usedMemory - singleProcess)
          singleProcessData.push(singleProcess)
          freeMemoryData.push(totalMemory - usedMemory)

          if (timeData.length > 100) {
            timeData.shift()
            singleProcessData.shift()
            usedMemoryData.shift()
            freeMemoryData.shift()
          }

          Plotly.update(memPlot.value, {
              x: [timeData, timeData, timeData],
              y: [usedMemoryData, singleProcessData, freeMemoryData]
          })
      }

      Agent.watch('metrics', ({ state }) => {
        Object
          .keys(state)
          .forEach(key => {
            if (!data[key]) data[key] = []
            console.log(state[key])
            const now = new Date()
            data[key].push(state[key].process)

            const {
              processCPU,
              processMemory,
              totalMemory,
              usedMemory
            } = state[key].process

            trace.x.push(now)
            trace.y.push(processCPU)
            console.log(trace.y)
            Plotly.update(cpuPlot.value, { x: [trace.x], y: [trace.y] })

            console.log(processMemory, totalMemory, usedMemory)

            updateGraph(now, processMemory, usedMemory, totalMemory)
          })
      }, 'node', 'core')
    }
  })
</script>

<template>
  <div>
    <div
      ref="cpuPlot"
    />
    <div
      ref="memPlot"
    />
  </div>

</template>