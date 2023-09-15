import { applyPatch } from 'https://esm.sh/fast-json-patch@3.1.1'
import Agent from './generic.js'

const SERVE_HOST = Deno.env.get("SERVE_HOST")
const SERVICE_ACCOUNT_TOKEN = Deno.env.get("SERVICE_ACCOUNT_TOKEN")

export default () => new Agent({
  host: SERVE_HOST,
  token: () => Deno.readTextFile(SERVICE_ACCOUNT_TOKEN),
  WebSocket,
  uuid: () => crypto.randomUUID(),
  fetch,
  applyPatch,
  reboot: () => Deno.exit(1)
})
