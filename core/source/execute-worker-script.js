import { uuid, isUUID, environment as ENV, decryptString } from './utils.js'
import SESSION from './session.js'
import configuration from './configuration.js'
import scopeToId from './scope-to-id.js'
import handleSideEffects from './handle-side-effects.js'
import coreSideEffects from './core-side-effects.js'
import { getState } from './persistence.js'
import interact from './interact.js'
import isolatedWorker from './isolated-worker.js'
import { domainWorkers, domainWorkerResponses } from './stateful.js'

const {
  SECRET_ENCRYPTION_KEY,
  PUBLIC_ENCRYPTION_KEY
} = ENV

const runIdToRequests = new Map()

function startWorker(workerKey, environment, namespaces) {
  const session = uuid()
  let initialized = false
  const pendingResponseIds = new Set()

  const worker = isolatedWorker(
    new URL("./domain-worker/index.js", import.meta.url).pathname
  )

  function respond(requestId, response) {
    worker.postMessage({ requestId, response, session })
  }

  worker.onerror = (e) => {
    console.error("Worker crashed:", e.message)
    delete domainWorkers[workerKey]
    rejectPendingResponses(worker, e.message)
    worker.terminate()
  }

  worker.onmessage = async (e) => {
    if (e.data.type === 'initialize') {
      initialized = true
      worker.postMessage({ type: 'setup', session })
    }
    else if (e.data.type === 'respond') {
      const { id, response, error } = e.data
      pendingResponseIds.delete(id)
      const responseHandler = domainWorkerResponses[id]
      if (!responseHandler) return console.warn('Received worker response for unknown request', environment.domain, id)

      if (error) responseHandler.reject(error)
      else responseHandler.resolve(response)
      delete domainWorkerResponses[id]
    }
    else if (messageHandlers[e.data.type]) {
      const { runId, requestId, type } = e.data
      let resolve
      const promise = new Promise(r => resolve = r)

      if (runIdToRequests.has(runId)) runIdToRequests.get(runId).add(promise)
      else runIdToRequests.set(runId, new Set([promise]))

      try {
        respond(
          requestId,
          await messageHandlers[type](session, environment, namespaces, e.data)
        )
      }
      catch (error) {
        console.warn('ERROR executing domain worker script', error)
      }
      finally {
        resolve()
        runIdToRequests.get(runId).delete(promise)
        if (runIdToRequests.get(runId).size === 0) runIdToRequests.delete(runId)
      }
    }
    else if (e.data.type === 'synced') {
      const { requestId, runId } = e.data
      await Promise.all(runIdToRequests.get(runId) || [])
      respond(requestId)
    }
    else {
      console.log("TODO: implement unhandled agent message type", environment.domain, e.data)
    }
  }

  worker.pendingResponseIds = pendingResponseIds
  return worker
}

function rejectPendingResponses(worker, error) {
  for (const id of worker.pendingResponseIds || []) {
    domainWorkerResponses[id]?.reject(error)
    delete domainWorkerResponses[id]
  }
  worker.pendingResponseIds?.clear()
}

async function decodeSecrets(secrets) {
  return (
    Object
      .fromEntries(
        Object
          .entries(secrets)
          .map(([key, encryptedSecret]) => {
            let secret
            try       { secret = decryptString(SECRET_ENCRYPTION_KEY, encryptedSecret) }
            catch (e) { secret = null }
            return [key, secret]
          })
      )
  )
}

export default function executeWorkerScript(refreshWorker, domain, user, script, variables, session, context=[], namespaces=[]) {
  const workerKey = domain + JSON.stringify({context, namespaces})

  if (refreshWorker && domainWorkers[workerKey]) {
    const staleWorker = domainWorkers[workerKey]
    rejectPendingResponses(staleWorker, 'Worker refreshed before completing request')
    staleWorker.terminate()
    delete domainWorkers[workerKey]
  }

  //  TODO: clean up dormant workers
  if (!domainWorkers[workerKey]) {
    domainWorkers[workerKey] = startWorker(
      workerKey,
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

  return new Promise((resolve, reject) => {
    domainWorkerResponses[id] = { resolve, reject }
    domainWorkers[workerKey].pendingResponseIds.add(id)
    domainWorkers[workerKey]
      .postMessage({ type: 'script', script, variables, id })
      .catch(error => {
        domainWorkers[workerKey]?.pendingResponseIds?.delete(id)
        delete domainWorkerResponses[id]
        reject(error)
      })
  })
}

function getNamespacedScope(namespace, scope) {
  const allow = namespace?.allow || []
  const prefix = typeof namespace === 'string' ? namespace : namespace?.prefix
  return prefix && !isUUID(scope) && !allow.some(allowPrefix => scope.startsWith(allowPrefix)) ? `${prefix}/${scope}` : scope
}

const messageHandlers = {
  environment: async (session, environment, namespaces) => {
    const { secrets } = await configuration(environment.domain)
    return { ...environment, secrets: await decodeSecrets(secrets || {}) }
  },
  state: async (session, environment, namespaces, { scope, user, domain: stateRequestDomain }) => {
    if (!user) user = environment.auth.user

    const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

    const id = await scopeToId(stateRequestDomain || environment.domain, user, namespacedScope)
    const { active={} } = await getState(stateRequestDomain || environment.domain, id)
    return active
  },
  interact: async (session, environment, namespaces, { scope, domain: stateRequestDomain, patch }) => {

    const { auth: { user }, context, domain } = environment
    const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

    const id = await scopeToId(stateRequestDomain || domain, user, namespacedScope)
    const log = []
    let response
    const domainSideEffectResponse = handleSideEffects({
      domain: stateRequestDomain || domain,
      user, scope, patch, id, context, session
    })
      .then(r => response = r)
      .catch(error => log.push(error))
    const { ii } = await interact(stateRequestDomain || domain, user, namespacedScope, patch, context)

    const si = null
    return new Promise (resolve => {
    //  TODO: unify. the following block is repeated in handle-connection
      coreSideEffects({
        id, session, domain, user, scope, active_type: null, patch, si, ii,
        send: async message => (
          domainSideEffectResponse
            .finally(() => resolve({...message, log, response}))
        )
      })
    })
  },
  metadata: async (session, environment, namespaces, { scope, user, domain: requestDomain, requestId, runId }) => {

    if (!user) user = environment.auth.user

    const namespacedScope = namespaces.reduceRight((nsScope, ns) => getNamespacedScope(ns, nsScope), scope)

    const id = await scopeToId(requestDomain || environment.domain, user, namespacedScope)
    const response = await getState(requestDomain || environment.domain, id)
    delete response.active
    delete response.history
    return response
  }
}
