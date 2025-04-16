<script setup>
  import TagTaggingsList from './filters/tag-taggings-list.vue'

  const props = defineProps({
    domain: {
      type: String,
      default: 'tags.knowlearning.systems'
    },
    partition: String,
    modelValue: {
      type: Array,
      default: () => []
    },
    selectLeavesOnly: Boolean,
    LabelComponent: Object,
  })

  const emit = defineEmits(['update:modelValue'])

  function select(tag) {
    const n = props.modelValue.filter(t => t !== tag)
    if (n.length === props.modelValue.length) n.push(tag)
    emit('update:modelValue', n)
  }

</script>

<template>
  <TagTaggingsList
    :selected="modelValue"
    @select="select"
    :tags="modelValue"
    :domain="domain"
    :partition="partition"
    :selected="selected"
    :select-leaves-only="selectLeavesOnly"
    :LabelComponent="LabelComponent"
  />
</template>
