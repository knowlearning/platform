<template>
  <svg viewBox="268 378 78 56" xmlns="http://www.w3.org/2000/svg">
    <g transform="matrix(1, 0, 0, 1, 208.1151916997908, 186.30017367452638)">
      <path
        :style="`
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
        `"
        d="M 73.452 235.039 L 65.162 222.501 L 63.046 228.462 L 70.277 238.944 L 85.093 239.355 L 89.502 247.371 L 96.205 242.027 L 89.149 235.861 L 81.213 231.134 L 70.983 231.339 L 73.275 235.039 L 81.389 235.244"
      />
      <path
        :style="`
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
          transform-box: fill-box;
          transform-origin: 50% 50%;
        `"
        d="M 113.809 233.415 L 105.519 245.953 L 103.403 239.992 L 110.634 229.51 L 125.45 229.099 L 129.859 221.083 L 136.562 226.427 L 129.506 232.593 L 121.57 237.32 L 111.34 237.115 L 113.632 233.415 L 121.746 233.21" transform="matrix(-1, 0, 0, -1, -0.00001, -0.000022)"
      />
      <path
        :style="`
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
        `"
        transform-origin="100 210"
        :transform="`translate(0 ${yOffset}) scale(${scale})`"
        d="M 96.973 232.536 C 96.973 232.536 69.72 211.307 75.201 202.421 C 83.339 189.225 98.528 206.723 98.528 206.723 C 98.528 206.723 107.101 190.089 116.671 199.194 C 129.901 211.781 96.973 232.536 96.973 232.536 Z"
      />
      <path
        :style="`
          fill: #FF3336;
          stroke: rgb(0, 0, 0);
          opacity: ${props.progress};
        `"
        transform-origin="100 210"
        :transform="`translate(0 ${yOffset}) scale(${scale})`"
        d="M 96.973 232.536 C 96.973 232.536 69.72 211.307 75.201 202.421 C 83.339 189.225 98.528 206.723 98.528 206.723 C 98.528 206.723 107.101 190.089 116.671 199.194 C 129.901 211.781 96.973 232.536 96.973 232.536 Z"
      />
    </g>
  </svg>
</template>

<script setup>
  import { computed } from 'vue'

  const props = defineProps({ progress: Number })

  const scale = computed(() => {
    return Math.min(props.progress * 1.5, 0.8)
  })

  const yOffset = computed(() => {
    console.log(Math.max((1-props.progress) * 50 - 20, -7))
    return Math.min(Math.max((1-props.progress) * 40 - 20, -7), 20)
  })
</script>