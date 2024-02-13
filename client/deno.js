import fastJSONPatch from 'fast-json-patch'
import Agent from './agents/generic/index.js'

const SERVE_HOST = Deno.env.get("SERVE_HOST")
const SERVICE_ACCOUNT_TOKEN = Deno.env.get("SERVICE_ACCOUNT_TOKEN")

const denoProcess = self

function Connection() {
  const thisConnection = this

  thisConnection.send = message => denoProcess.postMessage(message)

  (async function () {
    await new Promise(r => setTimeout(r, 1))
    thisConnection.onopen && thisConnection.onopen()
  })()

  //  TODO: consider what onclose and onerror mean in this case
  return thisConnection
}

export default new Agent({
  Connection,
  token: () => Deno.readTextFile(SERVICE_ACCOUNT_TOKEN),
  uuid: () => crypto.randomUUID(),
  fetch,
  applyPatch: fastJSONPatch.applyPatch,
  reboot: () => Deno.exit(1)
})
