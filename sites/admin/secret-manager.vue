<template>
  <v-list>
    <v-list-item
      v-for="(_, name) in secrets"
      :key="name"
      class="px-0"
    >
      <v-row align="center" class="w-100">
        <v-col cols="4">
          <span class="font-weight-medium">{{ name }}</span>
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="secrets[name]"
            hide-details
            variant="outlined"
          />
        </v-col>
        <v-col cols="2">
          <v-btn
            text="Remove"
            @click="() => delete secrets[name]"
          />
        </v-col>
      </v-row>
    </v-list-item>
    <v-list-item>
      <v-row align="center" class="w-100">
        <v-col cols="4">
          <v-text-field
            v-model="newSecretName"
            hide-details
            variant="outlined"
            label="New Secret Name"
          />
        </v-col>
        <v-col cols="6">
          <v-text-field
            v-model="newSecretValue"
            hide-details
            variant="outlined"
            label="New Secret Value"
          />
        </v-col>
        <v-col cols="2">
          <v-btn
            text="Add"
            @click="add"
          />
        </v-col>
      </v-row>
    </v-list-item>
  </v-list>
</template>

<script setup>
  import { ref } from 'vue' 

  const { secrets } = defineProps({
    secrets: Object
  })

  const newSecretName = ref('')
  const newSecretValue = ref('')

  function add() {
    secrets[newSecretName.value] = newSecretValue.value
    newSecretName.value = ''
    newSecretValue.value = ''
  }
</script>