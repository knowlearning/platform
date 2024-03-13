<template>
  <div v-if="provider === null">loading...</div>
  <div v-else-if="provider === 'anonymous'">
    <v-btn
      prepend-icon="fa-solid fa-right-to-bracket"
      @click="login"
    >
      login
    </v-btn>
  </div>
  <div v-else>
    {{ user }}
    <v-btn
      @click="logout"
      prepend-icon="fa-solid fa-arrow-right-from-bracket"
    >
      Logout
    </v-btn>
    <DomainSwitcher />
    <router-view></router-view>
  </div>
</template>

<script>

import { v4 as uuid } from 'uuid'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import ReportViewer from './report-viewer.vue'
import RelationalQueryInterface from './relational-query-interface.vue'
import DomainSwitcher from './domain-switcher.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  components: {
    vueScopeComponent,
    DomainSwitcher,
    ReportViewer,
    RelationalQueryInterface
  },
  data() {
    return {
      user: null,
      provider: null
    }
  },
  async created() {
    const { auth: { user, provider } } = await Agent.environment()

    this.user = user
    this.provider = provider
  },
  methods: {
    login() { Agent.login() },
    logout() { Agent.logout() }
  }
}

</script>