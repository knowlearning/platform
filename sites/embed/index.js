import { createApp, ref } from 'vue/dist/vue.esm-bundler'
import Agent from '@knowlearning/agents/browser.js'
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

window.Agent = Agent

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: { template: '<div>woo</div>' } },
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
