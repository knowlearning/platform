import { createApp } from 'vue'
import Agent from '@knowlearning/agents/browser.js'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import component from './index.vue'
import './third-party-setup.js'

window.Agent = Agent

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