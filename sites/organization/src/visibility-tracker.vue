<script setup>
  import { ref } from 'vue'
  const scroll = ref(window.scrollY)
  const windowHeight = ref(window.innerHeight)

  const container = ref(null)
  const scrolledBy = ref(0)

  addEventListener('scroll', (event) => {
    const {
      top,
      height
    } = container.value.getBoundingClientRect()
    const pixelsVisible = window.innerHeight - top
    scrolledBy.value = Math.max(0, Math.min(1, pixelsVisible/Math.min(height, window.innerHeight)))
    scroll.value = window.scrollY
  })

</script>

<template>
  <div ref="container">
    <slot :scrolledBy="scrolledBy"></slot>
  </div>
</template>
