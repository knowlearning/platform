<script setup>
  import { ref, reactive, onMounted } from 'vue'
  import Plotly from 'plotly.js-dist'

  const plotly = ref(null)
  const data = reactive({})

  onMounted(() => {
    if (plotly.value) {

      const trace = {
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
        yaxis: { title: 'Metric Value', range: [0, 1] }
      };

      Plotly.newPlot(plotly.value, [trace], layout, { displaylogo: false })

      Agent.watch('metrics', ({ state }) => {
        Object
          .keys(state)
          .forEach(key => {
            if (!data[key]) data[key] = []
            console.log(state[key])
            const now = new Date()
            data[key].push(state[key].process)

            trace.x.push(now)
            trace.y.push(state[key].process.processCPU)
            console.log(trace.y)
            Plotly.update(plotly.value, { x: [trace.x], y: [trace.y] });
          })
      }, 'node', 'core')
    }
  })
</script>

<template>
  <div>
    <div
      ref="plotly"
      style="height: 200px;"
    />
  </div>

</template>