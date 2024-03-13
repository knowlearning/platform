<template>
  <div v-if="provider === null">loading...</div>
  <div v-else-if="provider === 'anonymous'">
    <v-btn @click="login">login</v-btn>
  </div>
  <div v-else>
    {{ user }}
    <v-btn @click="logout">logout</v-btn>
    <span v-if="$router.currentRoute.value.fullPath !== '/'">
      <h1>
        {{ $router.currentRoute.value.params.domain }}
        <v-btn @click="$router.push('/')">
          switch domains
        </v-btn>
      </h1>
    </span>
    <router-view></router-view>
  </div>
</template>

<script>

import { v4 as uuid } from 'uuid'
import { vueScopeComponent } from '@knowlearning/agents/vue.js'
import ReportViewer from './report-viewer.vue'
import RelationalQueryInterface from './relational-query-interface.vue'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default {
  components: {
    vueScopeComponent,
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