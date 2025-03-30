<script setup>
  import { ref, reactive, computed, onMounted } from 'vue'
  import Plotly from 'plotly.js-dist'


  const plotly = ref(null)
  const data = reactive({})

  Agent.watch('metrics', ({ state }) => {
    Object
      .keys(state)
      .forEach(key => {
        if (!data[key]) data[key] = []
        console.log(state[key])
        data[key].push(state[key].process)
      })
  }, 'node', 'core')

  const cpuMetrics = computed(() => {
    return (
      Object
        .keys(data)
        .map(key => {
          return data[key].map(d => d.processCPU)
        })
    )
  })

  onMounted(() => {
    if (plotly.value) {

      const trace = {
          x: [],  // Time values in date format
          y: [],  // Metric values (0 to 1)
          mode: 'lines+markers',
          type: 'scatter',
          line: { color: 'blue' }
      }

      const layout = {
          title: 'Metric Over Time',
          height: 256,
          autosize: true,
          xaxis: {
              title: 'Time (HH:MM)',
              type: 'date',  // Ensures correct time handling
              tickformat: '%H:%M'  // Displays hours and minutes
          },
          margin: { t: 50, b: 50, l: 50, r: 50 },  // Adjust margins to give more space
          yaxis: { title: 'Metric Value', range: [0, 1] }
      };

      Plotly.newPlot(plotly.value, [trace], layout);

      setInterval(() => {
          const now = new Date();  // Get current timestamp
          const newMetric = Math.random();  // Random value between 0 and 1

          trace.x.push(now);
          trace.y.push(newMetric);

          Plotly.update(plotly.value, { x: [trace.x], y: [trace.y] });
      }, 1000);
    }
  })
</script>

<template>
  <div>
    NodeData {{ cpuMetrics }}
    <div
      ref="plotly"
      style="height: 200px;"
    />
  </div>

</template>