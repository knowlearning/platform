import { validate as isUUID } from 'uuid'
import { browserAgent, vuePersistentComponent } from '@knowlearning/agents'
import { createApp } from 'vue'
import root from './index.vue'

window.Agent = browserAgent()

const url = new URL(window.location.href)
const { pathname } = url

// If path is a uuid, use the corresponding data as props to the root component
const id = pathname.slice(1)
const props = isUUID(id) ? await Agent.state(id) : {}

console.log('LOADED SOME EXPERIENCE!!!!', props)

//  Use the serialized embedding context as the default scope for
//  this experience. Another possible choice is to simply use the
//  last part of the context as the name if reading/writing the same
//  scope in any context is the desired behavior for this content.
const { context } = await Agent.environment()
const defaultScope = '/' + context.join('/')

const app = createApp(vuePersistentComponent(root, defaultScope), props)
app.mount(document.body)
