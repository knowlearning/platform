<template>
  <div>
    <div>
      <TopLevelTagChip
        :selectLeavesOnly="props.selectLeavesOnly"
        v-for="tag in props.roots"
        :key="tag"
        :tag="tag"
        :partition="props.partition"
        :selected="modelValue"
        :domain="props.domain"
        :LabelComponent="LabelComponent"
        @select="select"
      />
      <v-dialog
        max-width="500"
        v-if="props.editable"
      >
        <template v-slot:activator="{ props: activatorProps }">
          <v-chip v-bind="activatorProps">+ Create Tag</v-chip>
        </template>
        <template v-slot:default="{ isActive }">
          <v-card title="New Tag">
            <v-card-text>
              <v-text-field
                autofocus
                v-model="newTagName"
                label="Name"
                @keypress.enter="() => {
                  createTag(newTagName)
                  isActive.value = false
                }"
              />
            </v-card-text>
            <v-card-actions>
              <v-spacer></v-spacer>
              <v-btn
                text="Add"
                @click="() => {
                  createTag(newTagName)
                  isActive.value = false
                }"
              ></v-btn>
              <v-btn
                text="Cancel"
                @click="isActive.value = false"
              ></v-btn>
            </v-card-actions>
          </v-card>
        </template>
      </v-dialog>
      <br/>
      <br/>
      <div
        class="active-filters mb-4"
        v-if="modelValue.length"
      >
        <h3>
          {{ modelValue.length > 1 ? 'Taggings For' : 'Active Tag' }}:
        </h3>
        <v-chip
          v-for="tag in modelValue"
          :key="tag"
          :class="{
            'mr-2': true,
            'mb-2': true,
            bounce: bounced[tag]
          }"
          @click:close="removeTag(tag)"
          draggable
          @dragstart="$event.dataTransfer.setData('text', tag)"
          @dblclick="selectSingleTag(tag)"
          color="primary"
          closable
        >
          <LabelComponent :id="tag" />
        </v-chip>
      </div>
    </div>
    <div v-if="modelValue.length === 0">
      Select tags above to filter by
    </div>
  </div>
</template>

<script setup>
  import { ref, reactive, watch } from 'vue'
  import DefaultLabelComponent from './label-component.vue'
  import TopLevelTagChip from './top-level-tag-chip.vue'

  const props = defineProps({
    selectLeavesOnly: {
      type: Boolean,
      default: false
    },
    editable: {
      type: Boolean,
      default: false
    },
    domain: {
      type: String,
      default: 'tags.knowlearning.systems'
    },
    partition: String,
    roots: Array,
    modelValue: {
      type: Array,
      default: () => []
    },
    LabelComponent: {
      type: Object,
      default: () => DefaultLabelComponent
    }
  })

  const LabelComponent = props.LabelComponent

  const emit = defineEmits(['update:modelValue'])

  const newTagName = ref('')
  const internalItems = ref([...props.modelValue])
  const bounced = reactive({})

  watch(
    () => props.modelValue,
    (newValue) => internalItems.value = [...newValue],
    { deep: true }
  )

  function bounceSelectedTag(tag) {
    bounced[tag] = false
    setTimeout(() => bounced[tag] = true)
  }

  function select(tag) {
    bounceSelectedTag(tag)
    if (!internalItems.value.includes(tag)) {
      internalItems.value.push(tag)
      emit('update:modelValue', [...internalItems.value])
    }
  }

  function removeTag(tag) {
    const index = internalItems.value.findIndex(id => id === tag)

    if (index > -1) {
      internalItems.value.splice(index, 1)
      emit('update:modelValue', [...internalItems.value])
    }
  }

  async function createTag(name) {
    const id = await Agent.create({
      active_type: 'application/json;type=tag-type',
      active: { name, description: 'A new tag' }
    })
    newTagName.value = ''
    selectSingleTag(id)
  }

  function selectSingleTag(tag) {
    bounceSelectedTag(tag)
    internalItems.value = [tag]
    emit('update:modelValue', [...internalItems.value])
  }
</script>

<style scoped>
  .active-filters {
    text-align: center;
  }
  .bounce {
    animation: bounce-in 0.3s;
  }
  @keyframes bounce-in {
    0% {
      transform: scale(1);
    }
    50% {
      transform: scale(1.25);
    }
    100% {
      transform: scale(1);
    }
  }
</style>
