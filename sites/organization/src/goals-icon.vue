<template>
  <svg viewBox="410 190 50 75" xmlns="http://www.w3.org/2000/svg">
    <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 419.189 223.268 L 419.189 199.724" />
    <path
      :transform="`translate(0 ${20 * (1-props.progress)})`"
      style="
        fill: rgb(216, 216, 216);
        stroke: rgb(0, 0, 0);
      "
      d="M 418.844 199.476 L 431.634 206.799 L 419.226 211.356 L 418.844 199.476 Z"
    />
    <path
      style="
        fill: rgb(216, 216, 216);
        stroke: rgb(0, 0, 0);
      "
      d="
        M 413 264
        L 413 223.711
        L 426.92 222.68
        L 427.122 235.848
        L 442.796 235.85
        L 442.594 249.525
        L 457.5 248.642
        L 457.5 264
        L 413 264
        Z
      "
    />
  </svg>
</template>

<script setup>
  const props = defineProps({ progress: Number })
</script>