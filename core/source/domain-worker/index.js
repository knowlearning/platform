import EmbeddedAgent from "npm:@knowlearning/agents@0.9.193/agents/embedded.js"

//  TODO: consider allowing EmbeddedAgent configuration of listener, rather than overwriting like this
const otherListeners = []
globalThis.addEventListener = (_type, fn) => otherListeners.push(fn)

function postMessage(message) {
  console.log(JSON.stringify(message))
}

const Agent = EmbeddedAgent(postMessage)

// TODO: move "getAgent" into Agent.connect(domain) structure
const domainAgents = {}
const getAgent = (domain, runId) => {
  if (!domainAgents[domain]) {
    postMessage({ type: "initialize" })
    domainAgents[domain] = EmbeddedAgent(m => postMessage({ ...m, domain }))
  }
  return domainAgents[domain].withRunId(runId)
}

// Handle messages coming in from parent via stdin
async function handleMessages() {
  for await (const line of readStdinLines()) {
    if (!line.trim()) continue

    try {
      await onmessage({ data: JSON.parse(line) })
    }
    catch (err) {
      postMessage({
        type: "respond",
        error: err.message
      })
    }
  }
}

async function* readStdinLines() {
  const decoder = new TextDecoder()
  let buffer = ""

  for await (const chunk of Deno.stdin.readable) {
    buffer += decoder.decode(chunk, { stream: true })
    let newlineIndex
    while ((newlineIndex = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, newlineIndex)
      buffer = buffer.slice(newlineIndex + 1)
      yield line
    }
  }

  buffer += decoder.decode()
  if (buffer) yield buffer
}

async function onmessage(e) {
  if (e.data.type === "script") {
    const { script, variables, id } = e.data
    runSafely(script, variables, id)
      .then((response) => {
        postMessage({
          type: "respond",
          id,
          response: response ? JSON.parse(JSON.stringify(response)) : response,
        })
      })
      .catch((error) => {
        postMessage({
          type: "respond",
          id,
          error: error.toString(),
        })
      })
  }
  else otherListeners.forEach(fn => fn(e))
}

// Startup handshake
postMessage({ type: "initialize" })
handleMessages()

async function runSafely(script, variables, runId) {
  //  TODO:  scope passed Agent global to include runId with all messages
  const blockedGlobals = [
    "Deno",
    "require",
    //"globalThis",
    "process",
    "Function",
    "eval",
    "WebSocket",
    //"setTimeout",
    "setInterval",
    "crypto",
  ]

  const extraGlobals = {
    Agent: Agent.withRunId(runId),
    getAgent: domain => getAgent(domain, runId)
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
    ...Object.values(variables),
  )
}
