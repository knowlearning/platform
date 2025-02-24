<script setup>
  import { v4 as uuid } from 'uuid'

  const props = defineProps({ text: String, update: Function })

  function deploy() {
  	props.update(uuid())
  }
</script>

<template>
  <span>
  	Deployment {{ text }}
  	<button @click="deploy">deploy</button>
  </span>
</template>