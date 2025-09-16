import { uuid, isUUID, environment as ENV, decryptString } from './utils.js'
import SESSION from './session.js'
import configuration from './configuration.js'
import scopeToId from './scope-to-id.js'
import handleSideEffects from './handle-side-effects.js'
import coreSideEffects from './core-side-effects.js'
import * as redis from './redis.js'
import interact from './interact/index.js'
import { domainWorkers, domainWorkerResponses } from './stateful.js'

const {
  SECRET_ENCRYPTION_KEY,
  PUBLIC_ENCRYPTION_KEY
} = ENV

function startWorker(environment, namespaces) {
  const session = uuid()
  let initialized = false

  const worker = new Worker(
    new URL("./domain-worker/index.js", import.meta.url).href,
    { type: "module" }
  )

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
    else if (e.data.type === 'respond') {
      const { id, response, error } = e.data
      if (error) domainWorkerResponses[id].reject(error)
      else domainWorkerResponses[id].resolve(response)
      delete domainWorkerResponses[id]
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
    else if (e.data.type === 'state') {
      let { scope, user, domain: stateRequestDomain, requestId } = e.data

      if (!user) user = environment.auth.user

      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

      const id = await scopeToId(stateRequestDomain || environment.domain, user, namespacedScope)
      const { active={} } = await redis.client.json.get(id)
      worker.postMessage({ requestId, response: active, session })
    }
    else if (e.data.type === 'interact') {
      let { scope, domain: stateRequestDomain, requestId, patch } = e.data

      const { auth: { user } , context, domain } = environment
      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

      const id = await scopeToId(domain, user, scope)
      const domainSideEffectResponse = handleSideEffects({
        domain: stateRequestDomain || domain,
        user, scope, patch, id, context, session
      })
      const { ii } = await interact(stateRequestDomain || domain, user, namespacedScope, patch, context)

      const si = null
      //  TODO: unify. the following block is repeated in handle-connection
      await coreSideEffects({
        id, session, domain, user, scope, active_type: null, patch, si, ii,
        send: async message => (
          domainSideEffectResponse
            .then(response => message.response = response)
            .catch(error => message.log = error)
            .finally(() => {
              worker
                .postMessage({
                  session,
                  requestId,
                  response: message
                })
            })
        )
      })
    }
    else if (e.data.type === 'metadata') {
      let { scope, user, domain: requestDomain, requestId } = e.data

      if (!user) user = environment.auth.user

      const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

      const id = await scopeToId(requestDomain || environment.domain, user, namespacedScope)
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
        variables
      },
      namespaces
    )
  }

  const id = uuid()

  domainWorkers[workerKey].postMessage({ type: 'script', script, variables, id })

  return new Promise((resolve, reject) => domainWorkerResponses[id] = { resolve, reject })
}

function getNamespacedScope(namespace, scope) {
  const allow = namespace?.allow || []
  const prefix = typeof namespace === 'string' ? namespace : namespace?.prefix
  return prefix && !isUUID(scope) && !allow.some(allowPrefix => scope.startsWith(allowPrefix)) ? `${prefix}/${scope}` : scope
}
