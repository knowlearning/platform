<template>
  <div>
    <div v-if="claimMessage">
      {{ claimMessage }}
      <vueScopeComponent :id="claimReport" />
      <v-btn @click="claimMessage = null">Okay</v-btn>
    </div>
    <v-btn v-else @click="claim">Become admin for {{ domain }}</v-btn>
    <div v-if="config">
      config:  {{config.config}}
      <ReportViewer
        :key="config.report"
        :report="config.report"
      />
    </div>
    <v-btn @click="uploadConfig">Upload</v-btn>
  </div>
</template>

<script>

import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import ReportViewer from './report-viewer.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  props: {
    domain: String
  },
  components: {
    vueScopeComponent,
    ReportViewer
  },
  data() {
    return {
      user: null,
      provider: null,
      config: null,
      claimReport: null,
      claimMessage: null
    }
  },
  async created() {
    const { auth: { user, provider } } = await Agent.environment()

    this.user = user
    this.provider = provider

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
        this.claimMessage = `You are now registered as the admin of ${this.domain}.`
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
    async uploadConfig() {
      const id = await Agent.upload({ browser: true, accept: '.yml,.yaml' })

      const report = Agent.uuid()

      await Agent.create({
        active: { config: id, report, domain: this.domain },
        active_type: DOMAIN_CONFIG_TYPE
      })

      await Agent.synced()

      this.config = (await Agent.query('current-config', [this.domain]))[0]
    },
  }
}

</script>