import { readLines } from "https://deno.land/std@0.224.0/io/read_lines.ts"
import EmbeddedAgent from "npm:@knowlearning/agents@0.9.193/agents/embedded.js"

//  TODO: consider allowing EmbeddedAgent configuration of listener, rather than overwriting like this
const otherListeners = []
globalThis.addEventListener = (_type, fn) => otherListeners.push(fn)

function postMessage(message) {
  console.log(JSON.stringify(message))
}

const Agent = EmbeddedAgent(postMessage)

// TODO: move "getAgent" into Agent.connect(domain) structure
const getAgent = (domain) => {
  postMessage({ type: "initialize" })
  return EmbeddedAgent((message) => postMessage({ ...message, domain }))
}

// Handle messages coming in from parent via stdin
async function handleMessages() {
  for await (const line of readLines(Deno.stdin)) {
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
    Agent,
    getAgent,
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
