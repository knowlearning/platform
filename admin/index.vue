<template>
  <div>{{ user }}</div>
  <div v-if="claimMessage">
    {{ claimMessage }}
    <vueScopeComponent :id="claimReport" />
    <button @click="claimMessage = null">Okay</button>
  </div>
  <button v-else @click="claim">Become admin for {{ domain }}</button>
  <div v-if="config ">
    config: {{config.config}}
    <vueScopeComponent :id="config.report" />
  </div>
  <input
    ref="fileInput"
    style="display: none;"
    type="file"
    @change="uploadConfig"
  />
  <button @click="$refs.fileInput.click()">
    Upload
  </button>
  <RelationalQueryInterface :domain="domain" />
  <DomainQueryPerformance :domain="domain" />
</template>

<script>

import { v4 as uuid } from 'uuid'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import RelationalQueryInterface from './relational-query-interface.vue'
import DomainQueryPerformance from './domain-query-performance.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  props: {
    user: String,
    domain: String
  },
  components: {
    vueScopeComponent,
    RelationalQueryInterface,
    DomainQueryPerformance
  },
  data() {
    return {
      config: null,
      claimReport: null,
      claimMessage: null
    }
  },
  async created() {
    this.config = (await Agent.query('current-config', [this.domain]))[0]
  },
  methods: {
    async claim() {
      const start = Date.now()
      this.claimMessage = 'claiming...'
      const { token, report } = await Agent.claim(this.domain)
      this.claimReport = report
      const elapsed = Date.now() - start
      await new Promise(r => setTimeout(r, 500 - elapsed))


      if (this.domain.startsWith(`${this.user}.localhost:`)) {
        this.claimMessage = `You are now registered as the admin of ${this.domain}. You are welcome, Matt.`
      }
      else {
        this.claimMessage = `
          Set "${token}" as a TXT record for "${this.domain}" become the admin.
          Alternatively, make your website "${this.domain}/.well-known/knowlearning-admin-challenge" respond with "${token}"
        `
      }
    },
    async removeDomainConfig() {
      if (confirm(`Are you sure you want to remove your configuration for "${this.domain}"`)) {
        delete this.config[this.domain]
      }
    },
    async uploadConfig(e) {
      const file = e.target.files[0]
      const id = await Agent.upload(file.name, file.type, file)
      e.target.value = ''

      const report = uuid()
      const { domain } = this

      await Agent.create({
        active: { config: id, report, domain },
        active_type: DOMAIN_CONFIG_TYPE
      })
      this.config = (await Agent.query('current-config', [this.domain]))[0]
    },
  }
}

</script>