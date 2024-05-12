<template>
  <v-list>
    <TagTaggingsListItem
      v-for="tag in tags"
      :key="tag"
      :tag="tag"
      :depth="props.depth"
      :domain="props.domain"
      :partition="props.partition"
      :selected="props.selected"
      @select="tag => emit('select', tag)"
      :select-leaves-only="props.selectLeavesOnly"
    />
  </v-list>
</template>

<script setup>
  import { ref } from 'vue'
  import TagTaggingsListItem from './tag-taggings-list-item.vue'

  const emit = defineEmits(['select'])
  const props = defineProps({
    selectLeavesOnly: Boolean,
    tags: Array,
    domain: String,
    partition: String,
    selected: Array,
    depth: {
      type: Number,
      default: 0
    }
  })
</script>