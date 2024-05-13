<template>
  <v-list-item
    @click.stop.prevent="select"
    :active="selected.includes(props.tag)"
    color="primary"
  >
    <template v-slot:prepend>
      <span :style="`display: block; width: ${depth * 48}px`" />
      <v-icon
        :icon="tag.icon || 'fa-solid fa-ellipsis'"
        :style="tag.icon ? '' : 'opacity: 0.1'"
      />
    </template>
    <v-list-item-title
      draggable
      @dragstart="$event.dataTransfer.setData('text', props.tag)"
      @dragover.prevent
    >
      <LabelComponent :id="props.tag" />
    </v-list-item-title>
    <template v-slot:append>
      <v-icon
        v-if="childTags.length"
        :style="{ marginLeft: `${ depth * 48 }px`}"
        @click.stop="open = !open"
        :icon="`fa-solid fa-chevron-${ open ? 'down' : 'right'}`"
      />
    </template>
  </v-list-item>
  <TagTaggingsList
    v-if="open"
    :tags="childTags"
    :domain="props.domain"
    :partition="props.partition"
    :selected="props.selected"
    :depth="props.depth + 1"
    @select="tag => emit('select', tag)"
    :select-leaves-only="props.selectLeavesOnly"
    :LabelComponent="LabelComponent"
  />
</template>

<script setup>
  import { ref, watch } from 'vue'
  import TagTaggingsList from './tag-taggings-list.vue'

  const emit = defineEmits(['select'])
  const tag = ref({})

  const props = defineProps({
    domain: String,
    tag: String,
    partition: String,
    selectLeavesOnly: Boolean,
    selected: Array,
    LabelComponent: Object,
    depth: {
      type: Number,
      default: 0
    }
  })
  const open = ref(false)
  const childTags = ref([])
  const { LabelComponent } = props

  updateChildTags()

  Agent.watch(props.tag, ({ state }) => tag.value = state)
  watch(open, updateChildTags)

  function updateChildTags() {
    Agent
      .query(
        'taggings-targeting-tags',
        [props.partition, props.tag],
        props.domain
      )
      .then(r => childTags.value = r.map(t => t.target))
  }

  //  TODO: need to await child tag fetch...
  function select() {
    if (props['selectLeavesOnly'] && childTags.value.length > 0) {
      open.value = true
      return
    }
    emit('select', props.tag)
  }

</script>

<style scoped>
  .sub-list
  {
    margin-left: 32px;
  }
</style>