import { validate as isUUID } from 'uuid'
import { browserAgent, vuePersistentComponent } from '@knowlearning/agents'
import { createApp } from 'vue'
import root from './index.vue'

window.Agent = browserAgent()
const url = new URL(window.location.href)
const { pathname } = url

// pathname is always prefixed with '/', so here we remove it
const { context } = await Agent.environment()

const defaultScope = '/' + context.join('/')
const app = createApp(vuePersistentComponent(root, defaultScope))
app.mount(document.body)
