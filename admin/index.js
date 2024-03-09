import { createApp } from 'vue'
import Agent from '@knowlearning/agents/browser.js'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import component from './index.vue'

import 'vuetify/styles'
import { createVuetify } from 'vuetify'
//  TODO: trim down imports
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

import './third-party-setup.js'

window.Agent = Agent

const { auth: { user, provider } } = await Agent.environment()

if (provider === 'anonymous') Agent.login()
else {
  // TODO: check domain and redirect / if invalid
  const domain = window.location.pathname.slice(1)
  const vuetify = createVuetify({ components, directives })

  createApp(component, { user, domain }).use(vuetify).mount('body')
}