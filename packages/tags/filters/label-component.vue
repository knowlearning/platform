<template>
  <vueScopeComponent :id="props.id" :path="['name']" />
</template>

<script>
  import { vueScopeComponent } from '@knowlearning/agents/vue.js'

  const props = defineProps({ id: String })
</script>