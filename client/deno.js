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

export default new Agent({
  Connection,
  token: () => AGENT_TOKEN,
  uuid: () => crypto.randomUUID(),
  fetch,
  applyPatch: fastJSONPatch.applyPatch,
  reboot: () => Deno.exit(1)
})
