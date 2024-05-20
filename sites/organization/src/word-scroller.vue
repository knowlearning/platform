<script setup>
import { ref, computed } from 'vue'

setInterval(() => {
  const lastAdjIndex = adjIndex.value
  const lastColorIndex = colorIndex.value
  while (lastAdjIndex === adjIndex.value || lastColorIndex === colorIndex.value) {
    adjIndex.value = Math.floor(Math.random() * adjectives.length)
    colorIndex.value = Math.floor(Math.random() * colors.length)
  }
}, 6000)

const adjectives = ["interactive", "collaborative", "engaging", "open-source", "flexible", "adaptive"]
const colors = ["#9B5DE5", "#00BBF9", "#00F5D4", "#11D98C", "#FEE440", "#FFA724", "#EE4266", "#F15BB5"]

const adjIndex = ref(0)
const colorIndex = ref(0)

const adjective = computed(() => adjectives[adjIndex.value])
const color = computed(() => colors[colorIndex.value])

</script>

<template>
  <span :style="{ color }" :key="color + adjective">{{ adjective }}</span>
</template>

<style scoped>
  span {
    animation: fade-in-out 6s;
  }

  @keyframes fade-in-out {
    00%{opacity:0}
    14%{opacity:1}
    68%{opacity:1}
    to{opacity:0}
  }
</style>