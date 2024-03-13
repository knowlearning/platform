import { createApp } from 'vue/dist/vue.esm-bundler'
import Agent from '@knowlearning/agents/browser.js'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import { createRouter, createWebHistory } from 'vue-router'

import 'vuetify/styles'
import { createVuetify } from 'vuetify'

//  TODO: trim down imports
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import Home from './home.vue'
import DomainSwitcher from './domain-switcher.vue'
import DomainConfig from './domain-config.vue'

import './third-party-setup.js'

window.Agent = Agent


const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: DomainSwitcher },
    { path: '/config/:domain', component: DomainConfig }
  ]
})
const vuetify = createVuetify({ components, directives })

createApp(Home)
  .use(router)
  .use(vuetify)
  .mount('body')
