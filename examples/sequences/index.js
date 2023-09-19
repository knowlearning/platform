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

//  Use the serialized embedding context as the default scope for
//  this experience. Another possible choice is to simply use the
//  last part of the context as the name if reading/writing the same
//  scope in any context is the desired behavior for this content.
const { context } = await Agent.environment()
const defaultScope = '/' + context.join('/')

const app = createApp(vuePersistentComponent(rootComponent, defaultScope), props)
app.mount(document.body)
