<template>
  <div v-if="!auth?.provider">loading...</div>
  <div v-else-if="auth?.provider === 'anonymous'">
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
      <DomainSwitcher class="ms-2" />
      <v-toolbar-title>
        {{ domain }}
      </v-toolbar-title>
      <v-tabs
        v-model="selectedTab"
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
        append-icon="fa-solid fa-arrow-right-from-bracket"
      >
        Logout
      </v-btn>
      <v-avatar
        class="ms-4 me-4"
        :image="auth.info.picture"
      />
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
  props: {
    tab: String
  },
  data() {
    return {
      auth: null,
      selectedTab: this.tab
    }
  },
  async created() {
    const { auth } = await Agent.environment()

    this.auth = auth
  },
  methods: {
    login() { Agent.login() },
    logout() { Agent.logout() },
  },
  computed: {
    domain() {
      return this.$router.currentRoute.value?.params?.domain
    }
  },
  watch: {
    selectedTab() {
      this.$router.push(`/${this.domain}/${this.selectedTab}`)
    }
  }
}

</script>