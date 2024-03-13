import { createApp, ref } from 'vue/dist/vue.esm-bundler'
import Agent from '@knowlearning/agents/browser.js'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import { createRouter, createWebHistory } from 'vue-router'

import 'vuetify/styles'
import '@fortawesome/fontawesome-free/css/all.css'
import { createVuetify } from 'vuetify'
import { aliases, fa } from 'vuetify/iconsets/fa'
import vuetifyKnowLearningTheme from './vuetify-knowlearning-theme.js'

//  TODO: trim down imports
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import Home from './home.vue'
import DomainConfig from './domain-config.vue'
import DomainAgents from './domain-agents.vue'
import DomainPostgres from './domain-postgres.vue'
import DomainTests from './domain-tests.vue'

import './third-party-setup.js'

window.Agent = Agent

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div>woo</div>' } },
    { path: '/:domain/config', component: DomainConfig, props: true },
    { path: '/:domain/agents', component: DomainAgents, props: true },
    { path: '/:domain/postgres', component: DomainPostgres, props: true },
    { path: '/:domain/tests', component: DomainTests, props: true }
  ]
})

const vuetify = createVuetify({
  components,
  directives,
  theme: {
    defaultTheme: 'vuetifyKnowLearningTheme',
    themes: {
      vuetifyKnowLearningTheme,
    },
  },
  icons: {
    defaultSet: 'fa',
    aliases,
    sets: { fa }
  }
})

createApp(Home)
  .use(router)
  .use(vuetify)
  .mount('body')
