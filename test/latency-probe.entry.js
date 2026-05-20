import { performance } from 'node:perf_hooks'
import { io } from 'socket.io-client'
import browserAgent from '@knowlearning/agents/browser/initialize.js'
import { normalizeHost, preflightApiHosts } from './api-preflight.js'

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
process.env.API_HOST ||= 'api-1:8765'
process.env.TEST_URL ||= 'https://localhost:5112/'

const samples = Number.parseInt(process.env.LATENCY_SAMPLES || '20', 10)
const apiHost = normalizeHost(process.env.LATENCY_API_HOST || process.env.API_HOST)
const origin = new URL(process.env.TEST_URL).origin
const domain = new URL(process.env.TEST_URL).host
const agents = new Set()

const originalLog = console.log
const originalWarn = console.warn

function filteredConsole(method, args) {
  const first = args[0]
  if (
    first === 'INITIALIZING AGENT CONNECTION'
    || first === 'AUTHORIZING NEWLY OPENED CONNECTION FOR SESSION:'
    || first === 'INIT MESSAGE'
    || first === 'DISCONNECTED AGENT!!!!!!!!!!!!!!!'
    || first === 'CONNECTION CLOSURE'
  ) return

  method(...args)
}

console.log = (...args) => filteredConsole(originalLog, args)
console.warn = (...args) => filteredConsole(originalWarn, args)

function percentile(sorted, pct) {
  if (!sorted.length) return 0
  const index = Math.min(sorted.length - 1, Math.ceil((pct / 100) * sorted.length) - 1)
  return sorted[index]
}

function summarize(label, values) {
  const sorted = [...values].sort((a, b) => a - b)
  const sum = values.reduce((total, value) => total + value, 0)
  return {
    label,
    n: values.length,
    min: sorted[0],
    p50: percentile(sorted, 50),
    avg: sum / values.length,
    p95: percentile(sorted, 95),
    max: sorted[sorted.length - 1]
  }
}

function printSummary(rows) {
  originalLog('\nLatency probe summary')
  originalLog('label'.padEnd(36), 'n'.padStart(3), 'min'.padStart(8), 'p50'.padStart(8), 'avg'.padStart(8), 'p95'.padStart(8), 'max'.padStart(8))
  for (const row of rows) {
    originalLog(
      row.label.padEnd(36),
      String(row.n).padStart(3),
      row.min.toFixed(1).padStart(8),
      row.p50.toFixed(1).padStart(8),
      row.avg.toFixed(1).padStart(8),
      row.p95.toFixed(1).padStart(8),
      row.max.toFixed(1).padStart(8)
    )
  }
}

async function measure(label, fn, count=samples) {
  const values = []
  for (let i = 0; i < count; i += 1) {
    const startedAt = performance.now()
    await fn(i)
    values.push(performance.now() - startedAt)
  }
  return summarize(label, values)
}

async function fetchSid() {
  const response = await fetch(`https://${apiHost}/_sid-check`, {
    method: 'GET',
    headers: { origin }
  })
  if (response.status === 201) return response.text()
  if (response.status === 200) return undefined
  throw new Error(`_sid-check returned ${response.status}`)
}

async function socketApiRoundTrip() {
  const sid = await fetchSid()

  await new Promise((resolve, reject) => {
    const socket = io(`https://${apiHost}`, {
      withCredentials: true,
      rejectUnauthorized: false,
      reconnection: false,
      timeout: 5000,
      extraHeaders: {
        origin,
        ...(sid ? { sid } : {})
      }
    })

    const cleanup = () => socket.disconnect()
    socket.once('connect_error', error => {
      cleanup()
      reject(error)
    })
    socket.once('error', error => {
      cleanup()
      reject(error)
    })
    socket.once('connect', () => {
      socket.once('api', () => {
        cleanup()
        resolve()
      })
      socket.emit('api')
    })
  })
}

function createAgent(token='anonymous') {
  const agent = browserAgent({
    unique: true,
    getToken: () => token,
    apiHost,
    domain,
    origin
  })
  agents.add(agent)
  return agent
}

function disconnectAgents() {
  for (const agent of agents) {
    try {
      agent.disconnect?.()
    }
    catch (_) {}
  }
}

try {
  await preflightApiHosts({ label: 'Latency probe API preflight', hosts: [apiHost] })

  const rows = []
  rows.push(await measure('raw fetch _sid-check', fetchSid))
  rows.push(await measure('raw socket.io connect + api', socketApiRoundTrip))

  rows.push(await measure('new Agent environment()', async () => {
    const agent = createAgent()
    await agent.environment()
    await agent.disconnect()
  }, Math.min(samples, 10)))

  rows.push(await measure('new ephemeral Agent environment()', async () => {
    const agent = createAgent('anonymous-ephemeral')
    await agent.environment()
    await agent.disconnect()
  }, Math.min(samples, 10)))

  const agent = createAgent()
  await agent.environment()

  rows.push(await measure('Agent.state(new scope)', async () => {
    await agent.state(agent.uuid())
  }))

  const existingScopes = []
  for (let i = 0; i < samples; i += 1) {
    const id = agent.uuid()
    await agent.state(id)
    existingScopes.push(id)
  }
  const existingScopeReader = createAgent()
  await existingScopeReader.environment()
  rows.push(await measure('Agent.state(existing uncached scope)', async index => {
    await existingScopeReader.state(existingScopes[index])
  }))

  const cachedScope = agent.uuid()
  await agent.state(cachedScope)
  rows.push(await measure('Agent.state(cached scope)', async () => {
    await agent.state(cachedScope)
  }))

  const responseScope = agent.uuid()
  const responseState = await agent.state(responseScope)
  rows.push(await measure('mutation + Agent.response()', async index => {
    responseState[`response_${index}`] = index
    await agent.response()
  }))

  const directScope = agent.uuid()
  await agent.state(directScope)
  rows.push(await measure('Agent.interact(existing scope)', async index => {
    await agent.interact(directScope, [
      { op: 'add', path: ['active', `direct_${index}`], value: index }
    ])
  }))

  const { session } = await agent.environment()
  rows.push(await measure('Agent.interact(sessions scope)', async index => {
    await agent.interact('sessions', [
      { op: 'add', path: ['active', session, 'latencyProbe', `${index}`], value: index }
    ], false)
  }))

  const syncedScope = agent.uuid()
  const syncedState = await agent.state(syncedScope)
  rows.push(await measure('mutation + Agent.synced()', async index => {
    syncedState[`synced_${index}`] = index
    await agent.synced()
  }))

  const writer = createAgent()
  const reader = createAgent()
  await Promise.all([writer.environment(), reader.environment()])
  const watchedScope = writer.uuid()
  const watchedState = await writer.state(watchedScope)
  await writer.synced()

  let expectedValue
  let resolveUpdate
  const watchReady = new Promise(resolve => {
    reader.watch(watchedScope, ({ state, patch }) => {
      if (patch === null) resolve()
      if (state.value === expectedValue && resolveUpdate) {
        resolveUpdate()
        resolveUpdate = null
      }
    })
  })
  await watchReady

  rows.push(await measure('cross-agent watch delivery', async index => {
    expectedValue = `value-${index}-${writer.uuid()}`
    const updatePromise = new Promise(resolve => resolveUpdate = resolve)
    watchedState.value = expectedValue
    const responsePromise = writer.response()
    await updatePromise
    await responsePromise
  }))

  printSummary(rows)
}
finally {
  disconnectAgents()
  if (process.env.LATENCY_NO_FORCE_EXIT !== '1') process.exit(0)
}
