import { createApp } from 'vue'
import { browserAgent } from '@knowlearning/agents'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import component from './index.vue'
import './third-party-setup.js'

window.Agent = browserAgent()

const { auth: { user, provider } } = await Agent.environment()

if (provider === 'anonymous') Agent.login()
else {
  // TODO: check domain and redirect / if invalid
  const props = {
    domain: window.location.pathname.slice(1),
    user
  }
  createApp(component, props).mount('body')
}