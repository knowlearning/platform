<template>
  <div v-if="config">
    <select v-model="domain">
      <option
        v-for="_, domain in config"
        :key="domain"
      >
        {{ domain }}
      </option>
    </select>
    <button v-if="domain" @click="removeDomainConfig">x</button>
    <button @click="claim">claim new domain</button>
    <div v-if="domain ">
      config yaml:
      <input v-model="config[domain].config" />
      <input
        ref="fileInput"
        style="display: none;"
        type="file"
        @change="uploadFile"
      >
      <button
        class="top-button"
        @click="$refs.fileInput.click()"
      >
        Upload
      </button>
      <RelationalQueryInterface :domain="domain" />
    </div>
  </div>
  <div v-else>
    loading...
  </div>
</template>

<script>

import RelationalQueryInterface from './relational-query-interface.vue'

export default {
  components: {
    RelationalQueryInterface
  },
  data() {
    return {
      domain: null,
      config: null
    }
  },
  async created() {
    this.config = await Agent.state('config')
  },
  methods: {
    async claim() {
      const domain = prompt('Domain to claim:')
      const { token } = await Agent.claim(domain)
      alert(`Set "${token}" as record at "${domain}" to get admin status.`)
      if (!this.config[domain]) {
        this.config[domain] = {
          config: null
        }
      }
    },
    async removeDomainConfig() {
      if (confirm(`Are you sure you want to remove your configuration for "${this.domain}"`)) {
        delete this.config[this.domain]
        this.domain = null
      }
    },
    async uploadFile(e) {
      const file = e.target.files[0]
      const id = await Agent.upload(file.name, file.type, file)
      e.target.value = ''

      this.config[this.domain] = { config: id }
    },
  }
}

</script>