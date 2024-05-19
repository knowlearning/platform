<template>
  <svg viewBox="282 194 34 50">
    <g transform="matrix(1, 0, 0, 1, -8.725992332786202, 176.26532245077672)">
      <path
        style="
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
        "
        d="M 295.693 67.421 L 301.446 42.684 L 311.592 43.123 L 314.207 66.835 L 296.53 66.982"
      />
      <ellipse
        style="
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
        "
        cx="306.467"
        cy="35.073"
        rx="7.217"
        ry="6.587"
      />
      <ellipse
        :style="`
          fill: #FEFADC;
          stroke: rgb(0, 0, 0);
          opacity: ${props.progress};
        `"
        cx="306.467"
        cy="35.073"
        rx="7.217"
        ry="6.587"
      />
      <rect x="301.55" y="22.046" width="10.46" height="5.123" style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);"/>
      <path
        v-for="d in [
          'M 314.835 30.828 L 323.098 26.876',
          'M 315.253 37.269 L 323.517 40.196',
          'M 297.994 30.096 L 290.463 25.851',
          'M 297.575 38 L 290.358 38.732'
        ]"
        :key="d"
        :style="`
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
          stroke-dashoffset: ${10 * (1-props.progress)};
          stroke-dasharray: 10;
        `"
        :d="d"
      />
    </g>
  </svg>
</template>

<script setup>
  const props = defineProps({ progress: Number })
</script>