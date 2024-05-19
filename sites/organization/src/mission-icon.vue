<template>
  <svg viewBox="406.8501 227.749 65.4445 44.5019">
    <g transform="matrix(0.7575740218162538, 0, 0, 0.6756739616394044, 357.76624068269484, 152.40767133843403)" style="">
      <g transform="matrix(1, 0, 0, 1, 5.671882, 2.181501)">
        <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 105.172 173.228 L 127.182 133.739 L 145.506 174.314"/>
        <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 71.481 171.811 L 101.964 109.324 L 128.053 175.187"/>
        <path style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" d="M 59.119 175.187 L 74.825 135.92 L 100.131 173.878"/>
      </g>
    </g>
    <path
      id="mission-logo-path"
      :style="`
        fill: rgb(216, 216, 216);
        paint-order: fill markers;
        stroke: rgb(0, 0, 0);
        stroke-dashoffset: ${Math.round(80 * (1-props.progress) / 8) * 8};
        stroke-dasharray: 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 4 80;
      `"
      d="M 439.655 271.051 C 439.655 271.051 453.846 269.269 451.695 262.32 C 450.335 257.926 441.718 256.837 436.104 255.294 C 432.84 254.396 430.592 253.346 431.377 251.403 C 433.512 246.119 445.068 248.879 443.627 243.715 C 442.186 238.551 432.445 242.968 439.368 228.574"
      transform="matrix(1, 0, 0, 1, 0, -2.842170943040401e-14)"
    />
  </svg>
</template>

<script setup>
  const props = defineProps({ progress: Number })
</script>