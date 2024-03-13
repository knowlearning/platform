import { createApp } from 'vue/dist/vue.esm-bundler'
import Agent from '@knowlearning/agents/browser.js'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import { createRouter, createWebHistory } from 'vue-router'

import 'vuetify/styles'
import '@fortawesome/fontawesome-free/css/all.css'
import { createVuetify } from 'vuetify'
import { aliases, fa } from 'vuetify/iconsets/fa'

//  TODO: trim down imports
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import Home from './home.vue'
import DomainConfig from './domain-config.vue'

import './third-party-setup.js'

window.Agent = Agent


const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div>woo</div>' } },
    { path: '/config/:domain', component: DomainConfig, props: true }
  ]
})
const vuetify = createVuetify({
  components,
  directives,
  icons: {
    defaultSet: 'fa',
    aliases,
    sets: { fa }
  }
})

console.log(aliases)

createApp(Home)
  .use(router)
  .use(vuetify)
  .mount('body')
