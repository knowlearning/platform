<script setup>
  import TagTaggingsList from './filters/tag-taggings-list.vue'
  import DefaultLabelComponent from './filters/label-component.vue'

  const props = defineProps({
    domain: {
      type: String,
      default: 'tags.knowlearning.systems'
    },
    partition: String,
    roots: Array,
    modelValue: Array,
    selectLeavesOnly: Boolean,
    LabelComponent:  {
      type: Object,
      default: () => DefaultLabelComponent
    }
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
    :tags="roots"
    :domain="domain"
    :partition="partition"
    :select-leaves-only="selectLeavesOnly"
    :LabelComponent="LabelComponent"
  />
</template>
