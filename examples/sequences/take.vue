<template>
  <div>
    <div>{{ time }}</div>
    <div>
      progress:
      <input
        type="range"
        min="0"
        max="1"
        step="0.01"
        v-model="progress"
      />
      {{ Math.floor(progress * 100) }}%
    </div>
    <div>
      score:
      <input type="number" v-model="score" />
    </div>
    <div>
      success:
      <select v-model="success">
        <option :value="null">null</option>
        <option :value="true">True</option>
        <option :value="false">False</option>
      </select>
    </div>
    <div>{{ scope || 'null' }}</div>
    <div>{{ content || 'null' }}</div>
    <div>{{ parent || 'null' }}</div>
  </div>
</template>

<script>
  import { v4 as uuid } from 'uuid'
  export default {
    props: {
      id: String
    },
    data() {
      return {}
    },
    async created() {
      const tick = () => setTimeout(() => { this.time += 1; tick() }, 1000)
      tick()
    }
  }
</script>