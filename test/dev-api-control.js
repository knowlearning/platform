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

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

function usage() {
  return `Usage:
  node dev-api-control.js status [api-host]
  node dev-api-control.js restart [api-host]

Examples:
  node dev-api-control.js status
  node dev-api-control.js restart
  node dev-api-control.js restart api-1:8765`
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

async function requestDevControl(host, path, { method='GET', expectedStatus=200 }={}) {
  const controller = new AbortController()
  const timeout = controlTimeoutMs()
  const timer = setTimeout(() => controller.abort(), timeout)

  try {
    const response = await fetch(`https://${host}${path}`, {
      method,
      headers: {
        accept: 'application/json',
        origin: new URL(process.env.TEST_URL || DEFAULT_TEST_URL).origin,
        'x-dev-control-token': controlToken()
      },
      signal: controller.signal
    })
    const body = await response.text()

    if (response.status !== expectedStatus) {
      throw new Error(`${method} ${path} returned ${response.status} ${response.statusText}: ${body}`)
    }

    try {
      return JSON.parse(body)
    }
    catch (error) {
      throw new Error(`${method} ${path} returned non-JSON response: ${body.slice(0, 200)}`)
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
    console.log(`${host} server=${body.server} mode=${body.mode} ready=${body.ready} uptime=${body.uptime}ms`)
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

async function restart(hosts, target) {
  await Promise.all(hosts.map(async host => {
    const body = await requestDevControl(host, '/_dev/restart', {
      method: 'POST',
      expectedStatus: 202
    })
    console.log(`${host} restart accepted server=${body.server}`)
  }))

  // Let the accepted response flush and the process exit before probing.
  await delay(750)
  await waitForPreflight(hosts, `Restarted API preflight`)

  if (target) {
    await waitForPreflight(configuredApiHosts(), 'Configured API preflight')
  }
}

async function main() {
  const [command='status', target] = process.argv.slice(2)
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
    await restart(hosts, target)
  }
  else {
    throw new Error(`Unknown command: ${command}\n${usage()}`)
  }
}

main().catch(error => {
  console.error(error.message)
  process.exit(1)
})
