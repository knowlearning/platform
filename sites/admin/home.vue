<template>
  <Suspense>
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
        <DomainSwitcher
          class="ms-2"
          @select="name => {
            if (name) $router.push(`/${name}/${tab || 'config'}`)
            else $router.push('/')
          }"
        />
        <v-toolbar-title>
          {{ title }}
        </v-toolbar-title>
        <v-tabs
          v-model="selectedTab"
          bg-color="primary"
          v-if="domain"
        >
          <v-tab value="config">Configuration</v-tab>
          <v-tab value="agents">Agents</v-tab>
          <v-tab value="sql">SQL</v-tab>
          <v-tab value="tests">Tests</v-tab>
        </v-tabs>
        <v-spacer />
        <v-btn
          class="me-2"
          :variant="isHistoryRoute ? 'flat' : 'text'"
          prepend-icon="fa-solid fa-clock-rotate-left"
          @click="$router.push('/history')"
        >
          History
        </v-btn>
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
      <v-container :key="domain">
        <router-view></router-view>
      </v-container>
    </div>
  </Suspense>
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
    return {
      auth: null
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
    },
    title() {
      if (this.isHistoryRoute) return 'History'
      return this.domain
    },
    isHistoryRoute() {
      return this.$router.currentRoute.value?.path === '/history'
    },
    selectedTab: {
      get() {
        return this.tab
      },
      set(tab) {
        this.$router.push(`/${this.domain}/${tab}`)
      }
    },
    tab() {
      return this.$router.currentRoute.value?.path.split('/')[2]
    }
  }
}

</script>
