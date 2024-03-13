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
    <v-toolbar
      color="primary"
    >
      <DomainSwitcher />
      <v-toolbar-title>
        {{ domain }}
      </v-toolbar-title>
      <v-tabs
        v-model="tab"
        bg-color="primary"
        v-if="domain"
      >
        <v-tab value="config">Configuration</v-tab>
        <v-tab value="agents">Agents</v-tab>
        <v-tab value="postgres">Postges</v-tab>
        <v-tab value="tests">Tests</v-tab>
      </v-tabs>
      <v-spacer />
      <v-btn
        @click="logout"
        prepend-icon="fa-solid fa-arrow-right-from-bracket"
      >
        Logout
      </v-btn>
    </v-toolbar>
    <router-view></router-view>
  </div>
</template>

<script>
import { v4 as uuid } from 'uuid'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import ReportViewer from './report-viewer.vue'
import DomainSwitcher from './domain-switcher.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  components: {
    vueScopeComponent,
    DomainSwitcher,
    ReportViewer
  },
  data() {
    console.log('current route?', this.$router.currentRoute.value)
    return {
      user: null,
      provider: null,
      tab: this.$router.currentRoute.value
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
  },
  computed: {
    domain() {
      return this.$router.currentRoute.value?.params?.domain
    }
  },
  watch: {
    tab() {
      this.$router.push(`/${this.domain}/${this.tab}`)
    }
  }
}

</script>