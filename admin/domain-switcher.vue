<script setup>
  import { ref, computed, watch } from 'vue'
  import { useRouter } from 'vue-router'

  const router = useRouter()

  const domain = ref(router.currentRoute?.value?.params?.domain || null)
  const domainStates = ref(null)
  const newDomainInput = ref('')

  Agent.state('domains').then(state => {
    // add domain to viewed domains if not present
    if (domain.value && !state[domain.value]) state[domain.value] = true
    domainStates.value = state
  })

  const domains = computed(() => Object.keys(domainStates.value || {}))

  function addDomain() {
    const name = prompt('Enter domain name')
    if (name) {
      domainStates.value[name] = true
      domain.value = name
      manageDomain(name)
    }
  }

  function manageDomain(domain) {
    router.push(`/config/${domain}`)
  }

  watch(domain, () => manageDomain(domain.value))

  function removeDomain(domain) {
    delete domainStates.value[domain]
  }

</script>

<template>
  <div v-if="domains === null">loading...</div>
  <div
    v-else
    class="d-flex"
  >
    <v-select
      v-model="domain"
      :items="domains"
      label="Selected Domain"
    >
      <template v-slot:prepend-item>
        <v-list-item
          title="Add New"
          @click="addDomain"
        >
        </v-list-item>
        <v-divider class="mt-2"></v-divider>
      </template>
      <template v-slot:item="{ props, item }">
        <v-list-item
          v-bind="props"
          @click:append-icon="removeClicked(event, props)"
        >
          <template v-slot:append>
            <v-icon
              icon="fa-solid fa-xmark"
              @click.stop="removeDomain(props.value)"
            />
          </template>
        </v-list-item>
      </template>
    </v-select>
  </div>
</template>