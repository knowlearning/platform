<template>
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="144 90 79 70">
    <g>
      <rect x="144.502" y="99.597" width="77.528" height="47.592" style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" ></rect>
      <rect x="206.294" y="103.861" width="8.06" height="8.444" style="fill: rgb(255, 149, 5); stroke: rgb(0, 0, 0);" ></rect>
      <path
        v-for="{ d, length }, i in lines"
        :style="`
          fill: rgb(216, 216, 216);
          stroke: rgb(0, 0, 0);
          stroke-dashoffset: ${length * (
            props.progress > waits[i]/total ? 0 : 1
          )};
          stroke-dasharray: ${length};
          transition: stroke-dashoffset ${length/total * 3}s;
        `"
        :d="d"
      />
      <line style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" x1="187.942" y1="106.164" x2="188.71" y2="142.626" ></line>
      <line style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" x1="195.699" y1="119.25" x2="212.015" y2="119.25" ></line>
      <line style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" x1="195.874" y1="123.266" x2="208.807" y2="123.266" ></line>
      <line style="fill: rgb(216, 216, 216); stroke: rgb(0, 0, 0);" x1="195.874" y1="127.282" x2="206.002" y2="127.282"></line>
      <g
        :style="`
          stroke-opacity: ${ progress < 0.99 ? 0 : 0.5};
          transition: stroke-opacity 0.1s;
        `"
      >
        <ellipse
          style="
            fill: none;
            stroke: rgb(0, 0, 0);
          "
          cx="206.351"
          cy="113.822"
          rx="6.098"
          ry="6.098"
        />
        <path style="fill: none; stroke: rgb(0, 0, 0);" d="M 197.966 109.554 C 200.942 102.41 212.852 121.461 215.955 116.261"></path>
        <path style="fill: none; stroke: rgb(0, 0, 0);" d="M 196.746 113.822 C 200.528 108.037 211.268 122.154 215.802 120.682"></path>
      </g>
    </g>
  </svg>
</template>

<script setup>
  const props = defineProps({ progress: Number })

  const lines = [
    {
      d: 'M 149.713 110.386 C 151.76 112.945 182.081 112.562 180.034 110.003',
      length: 33
    },
    {
      d: 'M 149.329 117.295 C 151.644 119.031 180.645 117.465 178.882 116.143',
      length: 30
    },
    {
      d: 'M 150.865 124.971 C 151.514 125.187 181.881 125.331 179.65 124.587',
      length: 30
    },
    {
      d: 'M 150.865 134.182 C 146.035 131.767 182.798 132.686 183.488 133.031',
      length: 34
    },
    {
      d: 'M 163.671 140.707 C 160.548 140.303 173.085 142 179.023 139.939',
      length: 18
    }
  ]

  const total =  100 + lines.reduce((prev, curr) => prev + curr.length, 0)

console.log(total)

  const waits = []
  let last = 100
  lines.forEach(l => {
    waits.push(last)
    last += l.length
  })
</script>