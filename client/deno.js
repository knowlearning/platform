import fastJSONPatch from 'fast-json-patch'
import Agent from './agents/generic/index.js'

const AGENT_TOKEN = Deno.env.get('AGENT_TOKEN')

const denoProcess = self

function Connection() {
  const thisConnection = this

  thisConnection.send = message => denoProcess.postMessage(message)

  const delay = new Promise(r => setTimeout(r))
  delay.then(() => thisConnection.onopen())
  denoProcess.onmessage = ({ data }) => thisConnection.onmessage(data)

  //  TODO: consider what onclose and onerror mean in this case
  return thisConnection
}

const children = {}
const listeners = {}

const agent = new Agent({
  Connection,
  token: () => AGENT_TOKEN,
  uuid: () => crypto.randomUUID(),
  fetch,
  applyPatch: fastJSONPatch.applyPatch,
  reboot: () => Deno.exit(1),
  handleDomainMessage: ({ type, session, data }, trigger) => {
    //  this functionality is only implemented for the deno
    //  agent for now, but this central management of children
    //  concept probably has a place in the generic agent
    if (type === 'open') {
      const child = {
        on: (eventType, reaction) => {
          if (!listeners[session]) throw new Error('Error attaching listener, child is closed')
          if (!listeners[session][eventType]) throw new Error('Only "mutate" and "close" events can be listened to with Agent.on')
          listeners[session][eventType].push(reaction)
        }
      }
      listeners[session] = { mutate: [], close: [] }
      children[session] = child
      trigger('child', child)
    }
    else if (type === 'mutate') {
      listeners[session].mutate.forEach(f => f(data))
      delete listeners[session]
      delete children[session]
    }
    else if (type === 'close') {
      listeners[session].close.forEach(f => f(data))
      delete listeners[session]
      delete children[session]
    }
  }
})

export default agent
