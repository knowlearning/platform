import { environment, requestDomain, SocketIOServer } from './utils.js'
import handleHttpRequest from './handle-http-request.js'
import handleSocketIOConnection from './handle-socketio-connection.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import Agent from './agent.js'
import SESSION from './session.js'
import { CPUData, processData, networkData, getInstanceInfo } from './metrics.js'

const io = new SocketIOServer({
  cors: {
    origin: (origin, callback) => {
      callback(null, origin)
    },
    allowedHeaders: ["sid"],
    credentials: true
  }
})

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`)

  socket.on('api', () => socket.emit('api', { ack: -1, auth: { provider: 'anonymous' } }))

  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`)
  })

  handleSocketIOConnection(socket, metricsPromise)
})

const socketIOHandler = io.handler()

const METRICS_POLL_INTERVAL = 5000
const STARTED_AT = Date.now()
const SOCKET_IO_HOSTS = [
  'socket-io.localhost:8765',
  'socket-io.knowlearning.systems',
  'socket-io.dev.knowlearning.systems'
]
const LOCAL_SOCKET_IO_ALIAS = /^socket-io-\d+\.localhost:\d+$/
const LOCAL_COMPOSE_API_SERVICE = /^api-\d+:8765$/
const VALID_INSPECT_MODES = new Set(['inspect', 'inspect-wait', 'inspect-brk'])
let shutdownApiServer = () => Deno.exit(0)

const {
  MODE,
  PORT,
  SSL_CERT: cert,
  SSL_KEY: key,
  TLS_PORT,
  ADMIN_DOMAIN,
  DEV_CONTROL_TOKEN,
  DENO_INSPECT_MODE_ACTIVE,
  DENO_INSPECT_MODE,
  DENO_INSPECT_MODE_FILE,
  DENO_INSPECT_HOST,
  DENO_INSPECT_PORT
} = environment
const INSPECT_MODE_FILE = DENO_INSPECT_MODE_FILE || '/tmp/knowlearning-core-inspect-mode'
const INSPECT_HOST = DENO_INSPECT_HOST || '0.0.0.0'
const INSPECT_PORT = DENO_INSPECT_PORT || '9229'
const ACTIVE_INSPECT_MODE = DENO_INSPECT_MODE_ACTIVE || DENO_INSPECT_MODE || (MODE === 'local' ? 'inspect' : 'none')

ensureDomainConfigured(ADMIN_DOMAIN)
ensureDomainConfigured('core')

Deno.serve({ port: TLS_PORT, cert, key }, handler)

function jsonResponse(body, init={}) {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  return new Response(JSON.stringify(body), { ...init, headers })
}

function notFound() {
  return new Response('Not Found', { status: 404 })
}

function devControlAuthorized(request) {
  return MODE === 'local'
    && DEV_CONTROL_TOKEN
    && request.headers.get('x-dev-control-token') === DEV_CONTROL_TOKEN
}

function inspectEndpoint(url, mode=ACTIVE_INSPECT_MODE) {
  if (mode === 'none') return null
  return `${url.hostname}:${INSPECT_PORT}`
}

function inspectStatus(url, mode=ACTIVE_INSPECT_MODE) {
  return {
    mode,
    host: INSPECT_HOST,
    port: Number.parseInt(INSPECT_PORT, 10),
    endpoint: inspectEndpoint(url, mode)
  }
}

async function restartOptions(request) {
  const body = await request.text()
  if (!body.trim()) return {}

  try {
    const parsed = JSON.parse(body)
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('body must be a JSON object')
    }
    return parsed
  }
  catch (error) {
    throw new Error(`Invalid JSON request body: ${error.message}`)
  }
}

async function handleDevControlRequest(request) {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/_dev/')) return null
  if (!devControlAuthorized(request)) return notFound()

  if (url.pathname === '/_dev/status' && request.method === 'GET') {
    return jsonResponse({
      server: SESSION,
      mode: MODE,
      host: url.host,
      ready: true,
      uptime: Date.now() - STARTED_AT,
      inspector: inspectStatus(url)
    })
  }

  if (url.pathname === '/_dev/restart' && request.method === 'POST') {
    let options
    try {
      options = await restartOptions(request)
    }
    catch (error) {
      return jsonResponse({ error: error.message }, { status: 400 })
    }

    const inspectMode = options.inspectMode || options.debugMode || options.inspector?.mode || 'inspect'
    if (!VALID_INSPECT_MODES.has(inspectMode)) {
      return jsonResponse({
        error: `Invalid inspectMode '${inspectMode}'. Expected one of: ${[...VALID_INSPECT_MODES].join(', ')}`
      }, { status: 400 })
    }

    try {
      await Deno.writeTextFile(INSPECT_MODE_FILE, `${inspectMode}\n`)
    }
    catch (error) {
      return jsonResponse({
        error: `Failed to persist inspector mode in ${INSPECT_MODE_FILE}: ${error.message}`
      }, { status: 500 })
    }

    setTimeout(() => shutdownApiServer(), 100)
    return jsonResponse({
      server: SESSION,
      mode: MODE,
      host: url.host,
      restarting: true,
      inspector: inspectStatus(url, inspectMode)
    }, { status: 202 })
  }

  return notFound()
}

async function handler(request, info) {
  const devControlResponse = await handleDevControlRequest(request)
  if (devControlResponse) return devControlResponse

  const domain = requestDomain(request)
  ensureDomainConfigured(domain)
  const url = new URL(request.url)
  const isLocalSocketIOAlias = MODE === 'local' && LOCAL_SOCKET_IO_ALIAS.test(url.host)
  const isLocalComposeApiService = MODE === 'local' && LOCAL_COMPOSE_API_SERVICE.test(url.host)
  if (request.url.endsWith('/_sid-check')) return handleHttpRequest(request)
  else if (SOCKET_IO_HOSTS.includes(url.host) || isLocalSocketIOAlias || isLocalComposeApiService) return socketIOHandler(request, info)
  else return handleHttpRequest(request, metricsPromise)
}

globalThis.addEventListener("unhandledrejection", event => {
  console.log("UNHANDLED REJECTION HANDLER", event, event.stack)
  event.preventDefault()
})

const metricsPromise = Agent
  .state('metrics')
  .then(metrics => {
    let shuttingDown = false
    metrics[SESSION] = {
      connections: {},
      websockets: {
        opened: 0,
        closed: 0,
        errored: 0
      },
      socketio: {
        opened: 0,
        closed: 0,
        errored: 0
      }
    }

    CPUData().then(data => metrics[SESSION].cpu = data)
    getInstanceInfo().then(data => metrics[SESSION].instance = data)

    let lastCall
    async function pollMetrics() {
      lastCall = Date.now()
      metrics[SESSION].ping = lastCall
      try {
        await Promise.all([
          processData().then(d => metrics[SESSION].process = d),
          networkData().then(d => metrics[SESSION].network = d)
        ])
      } catch (error) {
        metrics[SESSION].error = error.toString()
      }
      setTimeout(pollMetrics, METRICS_POLL_INTERVAL)
    }

    pollMetrics()

    async function shutdown() {
      if (shuttingDown) return
      shuttingDown = true
      console.log("Shutting down API server. Cleaning up...")
      metrics[SESSION].closed = Date.now()
      delete metrics[SESSION]
      //  TODO: diagnose why Agent.synced() not sufficient
      await new Promise(r => setTimeout(r, 250))
      await Agent.synced()
      console.log("Cleanup complete.")
      Deno.exit()
    }

    shutdownApiServer = shutdown
    Deno.addSignalListener("SIGTERM", shutdown)

    return metrics[SESSION]
  })
