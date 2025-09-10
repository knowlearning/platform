import { uuid, isUUID, environment as ENV, decryptString } from './utils.js'
import SESSION from './session.js'
import configuration from './configuration.js'
import scopeToId from './scope-to-id.js'
import * as redis from './redis.js'
import interact from './interact/index.js'
import { domainWorkers } from './stateful.js'

const {
  SECRET_ENCRYPTION_KEY,
  PUBLIC_ENCRYPTION_KEY
} = ENV

const workerScript = `
  //  TODO: better sub agent to expose to scripts
  import EmbeddedAgent from 'npm:@knowlearning/agents@0.9.179/agents/embedded.js'

  const Agent = EmbeddedAgent(postMessage)

  self.onmessage = e => {
    if (e.data.type === 'script') {
      const { script, variables } = e.data
      runSafely(script, variables)
        .then(() => null) //  TODO: report back successful run
        .catch(error => console.log('AGENT ERROR', error))
    }
  }

  postMessage({ type: 'initialize' })

  function runSafely(script, variables) {
    const blockedGlobals = [
      "Deno",
      "require",
      "globalThis",
      "process",
      "Function",
      "eval",
      "WebSocket",
      //"setTimeout",
      "setInterval",
      "crypto"
    ]

    const sandbox = new Function(
      "Agent",
      ...blockedGlobals,
      ...Object.keys(variables),
      \`return (async () => { \${script} })();\`
    )

    return sandbox(
      Agent,
      ...blockedGlobals.map(() => undefined),
      ...Object.values(variables)
    )
  }
`

function startWorker(environment, namespaces) {
  const session = uuid()
  const blob = new Blob([workerScript], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)

  const worker = new Worker(url, { type: "module" })
  let initialized = false

  worker.onerror = (e) => {
    console.error("Worker crashed:", e.message)
    delete domainWorkers[environment.domain]
    worker.terminate()
  }

  worker.onmessage = async (e) => {
    if (e.data.type === 'initialize') {
      initialized = true
      worker.postMessage({ type: 'setup', session })
    }
    else if (e.data.type === 'state') {
      let { scope, user, domain: stateRequestDomain, requestId } = e.data

      if (!user) user = environment.user
      if (!stateRequestDomain) stateRequestDomain = environment.domain

      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

      const id = await scopeToId(stateRequestDomain, user, namespacedScope)
      const { active={} } = await redis.client.json.get(id)
      worker.postMessage({ requestId, response: active, session })
    }
    else if (e.data.type === 'interact') {
      let { scope, domain: stateRequestDomain, requestId, patch } = e.data
      const { user, context, domain } = environment
      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)
      const { ii } = await interact(domain, user, namespacedScope, patch, context)
      worker.postMessage({ requestId, response: { ii }, session })
    }
    else if (e.data.type === 'environment') {
      const { secrets } = await configuration(environment.domain)

      const { requestId } = e.data
      worker
        .postMessage({
          requestId,
          response: {
            ...environment,
            secrets: await decodeSecrets(secrets || {}),
          },
          session
        })
    }
    else if (e.data.type === 'metadata') {
      let { scope, user, domain: requestDomain, requestId } = e.data

      if (!user) user = environment.user
      if (!requestDomain) requestDomain = environment.domain

      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

      const id = await scopeToId(requestDomain, user, namespacedScope)
      const response = await redis.client.json.get(id)
      delete response.active
      delete response.history
      worker.postMessage({ requestId, response, session })
    }
    else {
      console.log("TODO: implement unhandled agent message type", environment.domain, e.data)
    }
  }

  return worker
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

export default function executeWorkerScript(refreshWorker, domain, user, script, variables, session, context=[], namespaces=[]) {
  const workerKey = domain + JSON.stringify({context, namespaces})

  if (refreshWorker && domainWorkers[workerKey]) {
    domainWorkers[workerKey].terminate()
    delete domainWorkers[workerKey]
  }

  //  TODO: clean up dormant workers
  if (!domainWorkers[workerKey]) {
    domainWorkers[workerKey] = startWorker(
      {
        domain,
        server: SESSION,
        serverPublicKey: PUBLIC_ENCRYPTION_KEY,
        session,
        context,
        auth: { user, provider: 'core' },
        variables: {} //  TODO: decide what variables should be set
      },
      namespaces
    )
  }

  domainWorkers[workerKey].postMessage({ type: 'script', script, variables })
}

function getNamespacedScope(namespace, scope) {
  const allow = namespace?.allow || []
  const prefix = typeof namespace === 'string' ? namespace : namespace?.prefix
  return prefix && !isUUID(scope) && !allow.some(allowPrefix => scope.startsWith(allowPrefix)) ? `${prefix}/${scope}` : scope
}
