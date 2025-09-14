import EmbeddedAgent from 'npm:@knowlearning/agents@0.9.179/agents/embedded.js'

const Agent = EmbeddedAgent(postMessage)

self.onmessage = e => {
  if (e.data.type === 'script') {
    const { script, variables, id } = e.data
    runSafely(script, variables)
      .then(response => {
        postMessage({
          type: 'respond',
          id,
          response: response ? JSON.parse(JSON.stringify(response)) : response
        })
      })
      .catch(error => {
        console.log('AGENT ERROR', error)
        postMessage({
          type: 'respond',
          id,
          error: error.toString()
        })
      })
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
    `return (async () => { ${script} })();`
  )

  return sandbox(
    Agent,
    ...blockedGlobals.map(() => undefined),
    ...Object.values(variables)
  )
}