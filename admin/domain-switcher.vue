<script setup>
  import { ref, watch } from 'vue'
  import { useRouter } from 'vue-router'

  const router = useRouter()

  const domain = ref(router.currentRoute?.value?.params?.domain || null)
  const domains = ref(null)
  const domainStates = ref(null)
  const newDomainInput = ref('')

  Agent.state('domains').then(state => {
    // add domain to viewed domains if not present
    if (domain.value && !state[domain.value]) {
      state[domain.value] = true
    }

    domains.value = Object.keys(state)
    if (domain.value && !domains.value.includes(domain.value)) {
      //  TODO: validate domain name
      domains.value.push(domain.value)
    }
    domainStates.value = state
  })

  function addDomain() {
    const name = prompt('Enter domain name')
    if (name) {
      domainStates.value[name] = true
      domains.value.push(name)
      domain.value = name
      manageDomain(name)
    }
  }

  function manageDomain(domain) {
    router.push(`/config/${domain}`)
  }

  watch(domain, () => manageDomain(domain.value))

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
    </v-select>
  </div>
</template>