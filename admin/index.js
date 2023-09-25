import { createApp } from 'vue'
import { browserAgent } from '@knowlearning/agents'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import component from './index.vue'

window.Agent = browserAgent()

const root = vuePersistentComponent(component, 'default')
const app = createApp(root)

app.mount('body')