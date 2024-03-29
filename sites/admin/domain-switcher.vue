<script setup>
  import { ref, computed, watch } from 'vue'
  import { useRouter } from 'vue-router'

  const props = defineProps({ tab: String })
  const emit = defineEmits(['select'])

  const router = useRouter()
  const routerDomain = router.currentRoute?.value?.params?.domain

  const domain = ref(routerDomain || null)
  const domainStates = ref(null)
  const domainToAdd = ref('')

  Agent.state('domains').then(state => {
    // add domain to viewed domains if not present
    if (domain.value && !state[domain.value]) state[domain.value] = true
    domainStates.value = state
  })

  const domains = computed(() => Object.keys(domainStates.value || {}))

  watch(domain, () => emit('select', domain.value))

  function addDomain(name) {
    domainStates.value[name] = true
    domain.value = name
    emit('select', name)
  }

  function removeDomain(name) {
    console.log(domain.value, name)
    if (domain.value === name) domain.value = null
    delete domainStates.value[name]
  }

</script>

<template>
  <div v-if="domains === null">loading...</div>
  <div
    v-else
    class="d-flex"
  >
    <v-menu label="Selected Domain">
      <template v-slot:activator="{ props }">
        <v-btn
          v-bind="props"
          icon="fa-solid fa-gear"
        >
        </v-btn>
      </template>
      <v-list>
        <v-list-item
          v-for="name in domains"
          :key="name"
          @click="domain = name"
        >
          <v-list-item-title>{{ name }}</v-list-item-title>
          <template v-slot:append>
            <v-btn
              class="cursor-pointer"
              variant="plain"
              size="x-small"
              icon="fa-solid fa-xmark"
              @click.stop="removeDomain(name)"
            />
          </template>
        </v-list-item>
        <v-divider class="mt-2"></v-divider>
        <v-dialog max-width="500">
          <template v-slot:activator="{ props: activatorProps }">
            <v-list-item
              title="Add New"
              v-bind="activatorProps"
            />
          </template>
          <template v-slot:default="{ isActive }">
            <v-card title="Add Domain">
              <v-card-text>
                <v-text-field
                  autofocus
                  v-model="domainToAdd"
                  label="Domain"
                  @keypress.enter="() => {
                    addDomain(domainToAdd)
                    domainToAdd = ''
                    isActive.value = false
                  }"
                />
              </v-card-text>
              <v-card-actions>
                <v-spacer></v-spacer>

                <v-btn
                  text="Add"
                  @click="() => {
                    addDomain(domainToAdd)
                    domainToAdd = ''
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
      </v-list>
    </v-menu>
  </div>
</template>
