import { validate as isUUID } from 'uuid'
import { browserAgent, vuePersistentComponent } from '@knowlearning/agents'
import { createApp } from 'vue'
import editor from './editor.vue'
import player from './player.vue'
import previewer from './previewer.vue'

window.Agent = browserAgent()

const url = new URL(window.location.href)
const { pathname } = url

let rootComponent = editor
let props = {}

// If path is a uuid use the corresponding data as props to the root component
const id = pathname.slice(1)
if (isUUID(id)) {
  rootComponent = window.innerWidth < 200 || window.innerHeight < 200 ? previewer : player
  props = await Agent.state(id)
}

const app = createApp(vuePersistentComponent(rootComponent), props)
app.mount(document.body)
