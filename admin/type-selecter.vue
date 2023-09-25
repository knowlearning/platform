<template>
  <select
    @input="e => $emit('update:modelValue', e.target.value)"
  >
    <option :selected="modelValue === 'BOOLEAN' ? 'selected' : undefined">BOOLEAN</option>
    <option :selected="modelValue === 'TEXT' ? 'selected' : undefined">TEXT</option>
  </select>
</template>

<script>

export default {
  props: {
    modelValue: String
  },
  emits: ['update:modelValue']
}

</script>