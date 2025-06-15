import configuration from './configuration.js'

const domainWorkers = {}

async function handleSideEffects({ domain, user, scope, patch, ii, id, context, session }) {
  const config = await configuration(domain)

  //  TODO:
  //    check if domain has side effect match for this patch
  //    execute side effect script in worker

  if (!domainWorkers[domain]) startWorker(domain)

  //  TODO: be able to await side effect function run and add context to it
}

const workerScript = `
  //  TODO: better sub agent to expose to scripts
  import Agent from 'npm:@knowlearning/agents/deno.js'

  self.onmessage = e => {
    try {
      const result = runSafely(e.data)
      self.postMessage({ ok: true, result })
    } catch (err) {
      self.postMessage({ ok: false, error: err.message })
    }
  }

  function runSafely(code) {
    "use strict"

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

    const sandbox = new Function( ...blockedGlobals, \`"use strict"; return (\${code});\`)

    return sandbox(...blockedGlobals.map(() => undefined));
  }
`

function startWorker(domain) {
  console.log("Starting worker...")
  const blob = new Blob([workerScript], { type: "application/javascript" })
  const url = URL.createObjectURL(blob)

  const worker = new Worker(url, { type: "module" })

  worker.onerror = (e) => {
    console.error("Worker crashed:", e.message)
    delete domainWorkers[domain]
    worker.terminate()
  }

  worker.onmessage = (e) => {
    console.log("Received:", e.data);
  }

  domainWorkers[domain] = worker
}
