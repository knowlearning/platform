import { createApp, ref } from 'vue/dist/vue.esm-bundler'
import Agent from '@knowlearning/agents/browser.js'
import { createRouter, createWebHistory } from 'vue-router'
import PrimeVue from 'primevue/config'
import 'primevue/resources/themes/aura-light-green/theme.css'
import 'primeicons/primeicons.css'
import 'primeflex/primeflex.css'

import Main from './index.vue'
import Home from './home.vue'
import Player from './player.vue'

window.Agent = Agent

const router = createRouter({
  history: createWebHistory(),
  routes: [
    { path: '/', component: Home },
    { path: '/edit/:id', component: Home, props: true },
    { path: '/:id', component: Player, props: true }
  ]
})

createApp(Main)
  .use(router)
  .use(PrimeVue)
  .mount('body')
