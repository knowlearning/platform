import fastJSONPatch from 'fast-json-patch'
import Agent from './agents/generic/index.js'

const AGENT_TOKEN = Deno.env.get('AGENT_TOKEN')

const denoProcess = self

function Connection() {
  const connection = crypto.randomUUID()

  this.send = message => denoProcess.postMessage({ ...message, connection })

  denoProcess.addEventListener('message', ({ data }) => {
    if (data && data.connection === connection) this.onmessage(data)
    else this.onmessage(data) // think of better way that doesn't pass all heartbeats to all agents inside domain agent
  })

  // TODO: consider what onclose and onerror mean
  setTimeout(() => this.onopen())

  return this
}

const children = {}
const listeners = {}

const agents = {}

function getAgent(domain, forceNew) {
  if (agents[domain] && !forceNew) return agents[domain]

  const agent = new Agent({
    Connection,
    domain,
    token: () => AGENT_TOKEN,
    uuid: () => crypto.randomUUID(),
    async log() {
      await new Promise(r => setTimeout(r)) // so we can access our own agent instance

      const { session } = await agent.environment()
      let value

      try {
        value = structuredClone([...arguments])
      }
      catch (error) {
        value = `ERROR: error occurred logging arguments ${error} ${arguments}`
      }

      agent.interact('sessions', [{ op: 'add', path: ['active', session, 'log'], value }], false, false)
    },
    fetch,
    applyPatch: fastJSONPatch.applyPatch,
    reboot: () => Deno.exit(1),
    handleDomainMessage: ({ type, session, data }, trigger) => {
      //  this functionality is only implemented for the deno
      //  agent for now, but this central management of children
      //  concept probably has a place in the generic agent
      if (type === 'open') {
        const child = {
          environment: data,
          on: (eventType, reaction) => {
            if (!listeners[session]) throw new Error('Error attaching listener, child is closed')
            if (!listeners[session][eventType]) throw new Error('Only "mutate" and "close" events can be listened to with Agent.on')
            listeners[session][eventType].push(reaction)
          }
        }
        listeners[session] = { mutate: [], close: [] }
        children[session] = child
        trigger('child', child)
      }
      else if (type === 'mutate') {
        const filteredData = { ...data, patch: activePatch(data.patch) }
        listeners[session].mutate.forEach(f => f(filteredData))
      }
      else if (type === 'close') {
        listeners[session].close.forEach(f => f(data))
        delete listeners[session]
        delete children[session]
      }
    }
  })

  agents[domain] = agent

  return agent
}

function activePatch(patch) {
  return structuredClone(patch).filter(({ path }) => 'active' === path.shift())
}

export default getAgent(null)
export { getAgent }
