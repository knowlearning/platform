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
})

const socketIOHandler = io.handler()

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`)
  handleSocketIOConnection(socket, metricsPromise)
})

const METRICS_POLL_INTERVAL = 5000
const SOCKET_IO_HOSTS = [
  'socket-io.localhost:8765',
  'socket-io.knowlearning.systems'
]

const {
  MODE,
  PORT,
  SSL_CERT: cert,
  SSL_KEY: key,
  TLS_PORT,
  ADMIN_DOMAIN
} = environment

ensureDomainConfigured(ADMIN_DOMAIN)
ensureDomainConfigured('core')

Deno.serve({ port: TLS_PORT, cert, key }, handler)

async function handler(request, info) {
  const domain = requestDomain(request)
  ensureDomainConfigured(domain)
  const url = new URL(request.url)
  if (request.url.endsWith('/_sid-check')) return handleHttpRequest(request)
  else if (SOCKET_IO_HOSTS.includes(url.host)) return socketIOHandler(request, info)
  else return handleHttpRequest(request, metricsPromise)
}

globalThis.addEventListener("unhandledrejection", event => {
  console.log("UNHANDLED REJECTION HANDLER", event)
  event.preventDefault()
})

const metricsPromise = Agent
  .state('metrics')
  .then(metrics => {
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

    Deno.addSignalListener("SIGTERM", async () => {
      console.log("Received SIGTERM. Cleaning up...")
      metrics[SESSION].closed = Date.now()
      delete metrics[SESSION]
      //  TODO: diagnose why Agent.synced() not sufficient
      await new Promise(r => setTimeout(r, 250))
      await Agent.synced()
      console.log("Cleanup complete.")
      Deno.exit()
    })

    return metrics[SESSION]
  })
