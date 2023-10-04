import { createApp } from 'vue'
import { browserAgent } from '@knowlearning/agents'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import component from './index.vue'

window.Agent = browserAgent()

const app = createApp(component, { domain: window.location.pathname.slice(1) })

app.mount('body')