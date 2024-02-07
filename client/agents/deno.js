import fastJSONPatch from 'fast-json-patch'
import Agent from './generic/index.js'

const SERVE_HOST = Deno.env.get("SERVE_HOST")
const SERVICE_ACCOUNT_TOKEN = Deno.env.get("SERVICE_ACCOUNT_TOKEN")

export default new Agent({
  host: SERVE_HOST,
  token: () => Deno.readTextFile(SERVICE_ACCOUNT_TOKEN),
  WebSocket,
  uuid: () => crypto.randomUUID(),
  fetch,
  applyPatch: fastJSONPatch.applyPatch,
  reboot: () => Deno.exit(1)
})
