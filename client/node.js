import fs from 'fs'
import WebSocket from 'ws'
import { v1 as uuid } from 'uuid'
import fastJSONPatch from 'fast-json-patch'
import fetch from 'node-fetch'
import Agent from './agents/generic/index.js'

const { SERVE_HOST, SERVICE_ACCOUNT_TOKEN } = process.env

export default new Agent({
  host: SERVE_HOST,
  token: () => fs.promises.readFile(SERVICE_ACCOUNT_TOKEN).then(f => f.toString()),
  WebSocket,
  uuid,
  fetch,
  applyPatch: fastJSONPatch.applyPatch,
  reboot: () => process.exit(1)
})
