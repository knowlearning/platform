<script setup>
  import { ref } from 'vue'
  import { useRouter } from 'vue-router'

  const router = useRouter()

  const domains = ref(null)
  const newDomainInput = ref('')

  Agent.state('domains').then(state => domains.value = state)

  function addDomain() {
    domains.value[newDomainInput.value] = true
    newDomainInput.value = ''
  }

  function manageDomain(domain) {
    router.push(`/config/${domain}`)
  }
</script>

<template>
  <div v-if="domains === null">loading...</div>
  <div v-else>
    <div
      v-for="info, domain in domains"
      @click="manageDomain(domain)"
    >
      {{ domain }}
    </div>
    <div v-if="Object.keys(domains).length === 0">
      No entries
    </div>
    <div>
      <input
        placeholder="Add domain"
        v-model="newDomainInput"
        @keypress.enter="addDomain"
      />
    </div>
  </div>
  
</template>