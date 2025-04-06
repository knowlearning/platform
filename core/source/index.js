import { environment, requestDomain } from './utils.js'
import handleHttpRequest from './handle-http-request.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import Agent from './agent.js'
import SESSION from './session.js'
import { CPUData, processData, networkData, getInstanceInfo } from './metrics.js'

const METRICS_POLL_INTERVAL = 5000

const {
  MODE,
  PORT,
  INSECURE_DEVELOPMENT_CERT: cert,
  INSECURE_DEVELOPMENT_KEY: key,
  TLS_PORT,
  ADMIN_DOMAIN
} = environment

ensureDomainConfigured(ADMIN_DOMAIN)
ensureDomainConfigured('core')


if (cert && key) Deno.serve({ port: TLS_PORT, cert, key }, handler)

Deno.serve({ port: PORT }, handler)

function handler(request) {
  ensureDomainConfigured(requestDomain(request))
  return handleHttpRequest(request)
}

globalThis.addEventListener("unhandledrejection", event => {
  console.log("UNHANDLED REJECTION HANDLER", event)
  event.preventDefault()
})

Agent
  .state('metrics')
  .then(metrics => {
    metrics[SESSION] = {
      connections: {}
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
  })
