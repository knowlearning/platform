import { validate as isUUID } from 'uuid'
import { browserAgent } from '@knowlearning/agents'
import { vuePersistentComponent } from '@knowlearning/agents/vue.js'
import { createApp } from 'vue'
import managementInterface from './index.vue'
import players from './players/index.js'
import previewers from './previewers/index.js'

window.Agent = browserAgent()

const url = new URL(window.location.href)
const { pathname } = url

let rootComponent = managementInterface
let props = {}

// If path is a uuid we have a player for,
// use the corresponding data as props to the root component
const id = pathname.slice(1)
if (isUUID(id)) {
  const { active_type } = await Agent.metadata(id)
  if (players[active_type]) {
    rootComponent = window.innerWidth < 200 || window.innerHeight < 200 ? previewers[active_type] : players[active_type]
    props = await Agent.state(id)
  }
}

const app = createApp(vuePersistentComponent(rootComponent), props)
app.mount(document.body)
