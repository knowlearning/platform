<template>
  <button @click="claim">claim {{ domain }} domain</button>
  <div v-if="config ">
    config: {{config.config}}
    <vueScopeComponent :id="config.report" />
    <RelationalQueryInterface :domain="domain" />
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
</template>

<script>

import { v4 as uuid } from 'uuid'
import RelationalQueryInterface from './relational-query-interface.vue'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  props: {
    domain: String
  },
  components: {
    vueScopeComponent,
    RelationalQueryInterface
  },
  data() {
    return {
      config: null
    }
  },
  async created() {
    this.config = (await Agent.query('current-config', [this.domain]))[0]
  },
  methods: {
    async claim() {
      const { token } = await Agent.claim(this.domain)
      alert(`Set "${token}" as record at "${this.domain}" to get admin status.`)
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