import { environment, requestDomain, SocketIOServer } from './utils.js'
import handleHttpRequest from './handle-http-request.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import Agent from './agent.js'
import SESSION from './session.js'
import { CPUData, processData, networkData, getInstanceInfo } from './metrics.js'

const io = new SocketIOServer({
  cors: {
    origin: [
      'https://localhost:5173',
      'https://websocket-connection-test.netlify.app'
    ],
    allowedHeaders: ["sid"],
    credentials: true,
  },
})

io.on("connection", (socket) => {
  console.log(`socket ${socket.id} connected`)

  socket.emit("hello", "world")

  socket.on("disconnect", (reason) => {
    console.log(`socket ${socket.id} disconnected due to ${reason}`)
  })
})

const socketIOHandler = io.handler()

const METRICS_POLL_INTERVAL = 5000
const SOCKET_IO_HOSTS = [
  'socket-io.localhost:8765',
  'socket-io.api.knowlearning.systems'
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

if (cert && key) Deno.serve({ port: TLS_PORT, cert, key }, handler)

Deno.serve({ port: PORT }, handler)

async function handler(request, info) {
  const domain = requestDomain(request)
  ensureDomainConfigured(domain)
  const url = new URL(request.url)
  if (SOCKET_IO_HOSTS.includes(url.host)) return socketIOHandler(request, info)
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
      }
    }

    CPUData().then(data => metrics[SESSION].cpu = data)
    getInstanceInfo().then(data => metrics[SESSION].instance = data)

    let lastCall
    async function pollMetrics() {
      lastCall = Date.now()
      metrics[SESSION].ping = lastCall
      try {
        metrics[SESSION].process = await processData()
        metrics[SESSION].network = await networkData()
      } catch (error) {
        metrics[SESSION].error = error.toString()
      }
      setTimeout(pollMetrics, lastCall + METRICS_POLL_INTERVAL - Date.now())
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
