import EmbeddedAgent from 'npm:@knowlearning/agents@0.9.179/agents/embedded.js'

const Agent = EmbeddedAgent(postMessage)
// TODO: move "getAgent" into Agent.connect(domain) structure
const getAgent = domain => {
  postMessage({ type: 'initialize' })
  return EmbeddedAgent(message => postMessage({ ...message, domain }))
}

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
        postMessage({
          type: 'respond',
          id,
          error: error.toString()
        })
      })
  }
}

postMessage({ type: 'initialize' })

async function runSafely(script, variables) {
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

  const extraGlobals = {
    Agent,
    getAgent
  }

  const sandbox = new Function(
    ...Object.keys(extraGlobals),
    ...blockedGlobals,
    ...Object.keys(variables),
    `return (async () => { ${script} })();`
  )

  return sandbox(
    ...Object.values(extraGlobals),
    ...blockedGlobals.map(() => undefined),
    ...Object.values(variables)
  )
}