import process from 'node:process'
import { setTimeout as delay } from 'node:timers/promises'
import {
  configuredApiHosts,
  normalizeHost,
  preflightApiHosts
} from './api-preflight.js'

const DEFAULT_TEST_URL = 'https://localhost:5112/'
const DEFAULT_DEV_CONTROL_TOKEN = 'development-control-token'
const DEFAULT_CONTROL_TIMEOUT_MS = 30000
const RETRY_INTERVAL_MS = 1000
const INSPECT_FLAG_TO_MODE = new Map([
  ['--inspect', 'inspect'],
  ['--inspect-wait', 'inspect-wait'],
  ['--inspect-brk', 'inspect-brk']
])
const BLOCKING_INSPECT_MODES = new Set(['inspect-wait', 'inspect-brk'])

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function usage() {
  return `Usage:
  node dev-api-control.js status [api-host]
  node dev-api-control.js restart [api-host] [--inspect|--inspect-wait|--inspect-brk]

Examples:
  node dev-api-control.js status
  node dev-api-control.js restart
  node dev-api-control.js restart api-1:8765
  node dev-api-control.js restart api-1:8765 --inspect-wait
  node dev-api-control.js restart api-1:8765 --inspect-brk`
}

function controlToken() {
  return process.env.DEV_CONTROL_TOKEN || DEFAULT_DEV_CONTROL_TOKEN
}

function controlTimeoutMs() {
  const value = Number.parseInt(process.env.DEV_CONTROL_TIMEOUT || '', 10)
  return Number.isFinite(value) && value > 0 ? value : DEFAULT_CONTROL_TIMEOUT_MS
}

function targetHosts(target) {
  if (target) return [normalizeHost(target)].filter(Boolean)
  return configuredApiHosts()
}

function parseArgs(args) {
  const [command='status', ...rest] = args
  let target
  let inspectMode

  for (const arg of rest) {
    if (INSPECT_FLAG_TO_MODE.has(arg)) {
      inspectMode = INSPECT_FLAG_TO_MODE.get(arg)
    }
    else if (!target) {
      target = arg
    }
    else {
      throw new Error(`Unexpected argument: ${arg}\n${usage()}`)
    }
  }

  if (BLOCKING_INSPECT_MODES.has(inspectMode) && !target) {
    throw new Error(`${inspectMode} requires a single api-host target so the whole API cluster is not blocked.`)
  }

  return { command, target, inspectMode }
}

async function requestDevControl(host, path, { method='GET', expectedStatus=200, body: requestBody }={}) {
  const controller = new AbortController()
  const timeout = controlTimeoutMs()
  const timer = setTimeout(() => controller.abort(), timeout)
  const headers = {
    accept: 'application/json',
    origin: new URL(process.env.TEST_URL || DEFAULT_TEST_URL).origin,
    'x-dev-control-token': controlToken()
  }
  if (requestBody !== undefined) headers['content-type'] = 'application/json'

  try {
    const response = await fetch(`https://${host}${path}`, {
      method,
      headers,
      body: requestBody === undefined ? undefined : JSON.stringify(requestBody),
      signal: controller.signal
    })
    const responseBody = await response.text()

    if (response.status !== expectedStatus) {
      throw new Error(`${method} ${path} returned ${response.status} ${response.statusText}: ${responseBody}`)
    }

    try {
      return JSON.parse(responseBody)
    }
    catch (error) {
      throw new Error(`${method} ${path} returned non-JSON response: ${responseBody.slice(0, 200)}`)
    }
  }
  catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`${method} ${path} timed out after ${timeout}ms`)
    }
    throw error
  }
  finally {
    clearTimeout(timer)
  }
}

async function status(hosts) {
  const results = await Promise.all(hosts.map(async host => {
    const body = await requestDevControl(host, '/_dev/status')
    return { host, body }
  }))

  for (const { host, body } of results) {
    const inspector = body.inspector
    const inspectorText = inspector
      ? ` inspector=${inspector.mode} endpoint=${inspector.endpoint || 'none'}`
      : ''
    console.log(`${host} server=${body.server} mode=${body.mode} ready=${body.ready} uptime=${body.uptime}ms${inspectorText}`)
  }
}

async function waitForPreflight(hosts, label) {
  const timeout = controlTimeoutMs()
  const deadline = Date.now() + timeout
  let lastError

  while (Date.now() < deadline) {
    try {
      await preflightApiHosts({ hosts, label })
      return
    }
    catch (error) {
      lastError = error
      await delay(RETRY_INTERVAL_MS)
    }
  }

  throw new Error(`${label} did not pass within ${timeout}ms:\n${lastError?.message || 'unknown error'}`)
}

async function restart(hosts, target, inspectMode='inspect') {
  await Promise.all(hosts.map(async host => {
    const body = await requestDevControl(host, '/_dev/restart', {
      method: 'POST',
      expectedStatus: 202,
      body: { inspectMode }
    })
    const endpoint = body.inspector?.endpoint || `${host.split(':')[0]}:9229`
    console.log(`${host} restart accepted server=${body.server} inspector=${body.inspector?.mode || inspectMode} endpoint=${endpoint}`)
  }))

  if (BLOCKING_INSPECT_MODES.has(inspectMode)) {
    console.log(`API preflight skipped because ${inspectMode} waits for debugger attachment before startup continues.`)
    return
  }

  // Let the accepted response flush and the process exit before probing.
  await delay(750)
  await waitForPreflight(hosts, `Restarted API preflight`)

  if (target) {
    await waitForPreflight(configuredApiHosts(), 'Configured API preflight')
  }
}

async function main() {
  const { command, target, inspectMode } = parseArgs(process.argv.slice(2))
  if (command === 'help' || command === '-h' || command === '--help') {
    console.log(usage())
    return
  }

  const hosts = targetHosts(target)
  if (!hosts.length) throw new Error('No API hosts configured')

  if (command === 'status') {
    await status(hosts)
  }
  else if (command === 'restart') {
    await restart(hosts, target, inspectMode || 'inspect')
  }
  else {
    throw new Error(`Unknown command: ${command}\n${usage()}`)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
