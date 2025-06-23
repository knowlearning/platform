import { uuid, environment as ENV, decryptString} from './utils.js'
import * as redis from './redis.js'
import configuration from './configuration.js'
import scopeToId from './scope-to-id.js'
import interact from './interact/index.js'
import SESSION from './session.js'

const domainWorkers = {}
const currentConfig = {}

const {
  SECRET_ENCRYPTION_KEY,
  PUBLIC_ENCRYPTION_KEY
} = ENV

export default async function handleSideEffects({ domain, user, scope, patch, ii, id, context, session }) {
  if (domain === 'core') return

  const config = await configuration(domain)

  //  TODO:
  //    check if domain has side effect match for this patch
  //    execute side effect script in worker
  const newConfig = config !== currentConfig[domain]
  currentConfig[domain] = config

  if (newConfig && domainWorkers[domain]) {
    domainWorkers[domain].terminate()
    delete domainWorkers[domain]
  }

  if (!domainWorkers[domain]) {
    const environment = {
      domain,
      server: SESSION,
      serverPublicKey: PUBLIC_ENCRYPTION_KEY,
      session,
      auth: { user: domain, provider: 'core' },
      secrets: await decodeSecrets(config.secrets || {}),
      variables: {}
    }
    startWorker(domain, environment)
  }

  //  TODO: be able to await side effect function run and add context to it
  domainWorkers[domain]
    .postMessage({
      type: 'script',
      script: `
        const state = await Agent.state("stately")
        state.x = state.x || 0
        state.x += 1
        console.log("Agent state:", await Agent.state("stately"))
        console.log("Agent environment:", await Agent.environment())
      `
     })
}

const workerScript = `
  //  TODO: better sub agent to expose to scripts
  import EmbeddedAgent from 'npm:@knowlearning/agents@0.9.179/agents/embedded.js'

  const Agent = EmbeddedAgent(postMessage)

  self.onmessage = e => {
    if (e.data.type === 'script') {
      runSafely(e.data.script)
        .then(() => null) //  TODO: report back successful run
        .catch(error => console.log('AGENT ERROR', error))
    }
  }

  postMessage({ type: 'initialize' })

  function runSafely(code) {
    const blockedGlobals = [
      "Deno",
      "require",
      "globalThis",
      "process",
      "Function",
      "eval",
      "fetch",
      "WebSocket",
      "setTimeout",
      "setInterval",
      "crypto",
    ]

    const sandbox = new Function(
      "Agent",
      ...blockedGlobals,
      \`return (async () => { \${code} })();\`
    );
    return sandbox(Agent, ...blockedGlobals.map(() => undefined));
  }
`

function startWorker(domain, environment) {
  const session = uuid()
  console.log("Starting worker...")
  const blob = new Blob([workerScript], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)

  const worker = new Worker(url, { type: "module" })
  let initialized = false

  worker.onerror = (e) => {
    console.error("Worker crashed:", e.message)
    delete domainWorkers[domain]
    worker.terminate()
  }

  worker.onmessage = async (e) => {
    if (e.data.type === 'initialize') {
      initialized = true
      worker.postMessage({ type: 'setup', session })
    }
    else if (e.data.type === 'state') {
      let { scope, user, domain: stateRequestDomain, requestId } = e.data

      if (!user) user = domain
      if (!stateRequestDomain) stateRequestDomain = domain

      const id = await scopeToId(stateRequestDomain, user, scope)
      const { active={} } = await redis.client.json.get(id)
      worker.postMessage({ requestId, response: active, session })
    }
    else if (e.data.type === 'interact') {
      let { scope, domain: stateRequestDomain, requestId, patch } = e.data

      const user = domain
      if (!stateRequestDomain) stateRequestDomain = domain

      const { ii } = await interact(stateRequestDomain, user, scope, patch)
      worker.postMessage({ requestId, response: { ii }, session })
    }
    else if (e.data.type === 'environment') {
      const { requestId } = e.data
      worker
        .postMessage({
          requestId,
          response: environment,
          session
        })
    }
    else {
      console.log("TODO: implement unhandled agent message type", domain, e.data)
    }
  }

  domainWorkers[domain] = worker
}

async function decodeSecrets(secrets) {
  return (
    Object
      .fromEntries(
        Object
          .entries(secrets)
          .map(([key, encryptedSecret]) => [
            key,
            decryptString(SECRET_ENCRYPTION_KEY, encryptedSecret)
          ])
      )
  )
}
