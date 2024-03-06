<template>
  <div>{{ user }}</div>
  <div v-if="claimMessage">
    {{ claimMessage }}
    <vueScopeComponent :id="claimReport" />
    <v-btn @click="claimMessage = null">Okay</v-btn>
  </div>
  <v-btn v-else @click="claim">Become admin for {{ domain }}</v-btn>
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
  <v-btn @click="$refs.fileInput.click()">
    Upload
  </v-btn>
  <RelationalQueryInterface :domain="domain" />
  <div>
    <v-virtual-scroll
      :height="300"
      :items="agentLogs"
    >
      <template v-slot:default="{ item }">
        Item {{ item }}
      </template>
    </v-virtual-scroll>
  </div>
</template>

<script>

import { v4 as uuid } from 'uuid'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import RelationalQueryInterface from './relational-query-interface.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  props: {
    user: String,
    domain: String
  },
  components: {
    vueScopeComponent,
    RelationalQueryInterface
  },
  data() {
    return {
      config: null,
      agentLogs: [],
      claimReport: null,
      claimMessage: null
    }
  },
  async created() {
    this.config = (await Agent.query('current-config', [this.domain]))[0]
    Agent.watch(
      'sessions',
      ({ patch, state }) => patch && patch.forEach(({ op, path, value }) => {
        if (op === 'add' && path.length === 2 && path[1] === 'log') {
          const [ serverSession ] = path
          this.agentLogs.push([serverSession, value])
        }
      }),
      this.domain,
      this.domain
    )
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
      const uploadInfo = { name: file.name, type: file.type, data: file }
      const id = await Agent.upload(uploadInfo)
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