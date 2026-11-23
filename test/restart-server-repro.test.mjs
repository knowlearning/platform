import test, { after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const fixtureName = Symbol.for('knowlearning.restart-server-repro')
const domain = 'restart-repro.test'
const user = 'repro-user'
const session = 'repro-session'
const publications = new Map()
const interactions = []
let sideEffectsGate
let startedSideEffects = 0
let sampleHeap
const sourceRoot = new URL('../core/source/', import.meta.url)
const mocks = new Map()
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const stub = names => `const fixture = globalThis[Symbol.for('knowlearning.restart-server-repro')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
const mockDefault = (path, name) => mock(path, `${stub([name])}\nexport default ${name};`)

globalThis[fixtureName] = {
  environment: { ADMIN_DOMAIN: 'admin.test', SUPER_ADMINS: [], HEARTBEAT_INTERVAL: 3600000 },
  jwt: { sign: (_claims, _key, _options, callback) => callback(null, 'repro-jwt') },
  uuid: () => 'repro-uuid',
  isUUID: () => false,
  authenticate: async () => ({ user, session, provider: 'repro', info: {} }),
  scopeToId: async (_domain, _user, scope) => `resolved:${scope}`,
  async interact(_domain, _user, scope, patch) {
    sampleHeap?.()
    interactions.push({ scope, patch })
    return { ii: interactions.length, active_type: 'application/json' }
  },
  assertInteractionAllowed: async () => {},
  async handleSideEffects() {
    startedSideEffects += 1
    await sideEffectsGate
  },
  getState: async () => ({ active: {} }),
  subscribe: (id, callback) => publications.set(id, callback)
}

mock('utils.js', stub(['environment', 'jwt', 'uuid', 'isUUID']))
mock('persistence.js', stub(['getState', 'subscribe']))
mock('interact.js', `${stub(['interact', 'assertInteractionAllowed'])}\nexport default interact;`)
mockDefault('authenticate/index.js', 'authenticate')
mockDefault('scope-to-id.js', 'scopeToId')
mock('session.js', 'export default "repro-server"')
mock('authorize.js', 'export default async () => true')
mock('handle-guarantee.js', 'export default async () => {}')
mock('domain-agent/index.js', 'export default async () => null')
mockDefault('handle-side-effects.js', 'handleSideEffects')
mock('configured-query.js', 'export default async () => ({ rows: [] })')
mock('side-effects/configure.js', 'export const applyConfiguration = async () => {}; export const prepareStorageForConfiguration = async () => {};')
mock('side-effects/index.js', 'export default {}')
mock('core-state.js', 'export const coreStateSynced = async () => {}; export default async () => ({});')
mock('configuration.js', 'export const domainAdmin = async () => "admin-user";')

const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url) ? { format: 'module', source: mocks.get(url), shortCircuit: true } : nextLoad(url, context)
  }
})
const { default: handleConnection } = await import('../core/source/handle-connection.js')
const stateful = await import('../core/source/stateful.js')
hooks.deregister()
after(() => { delete globalThis[fixtureName] })

const turn = () => new Promise(resolve => setImmediate(resolve))
const patch = [{ op: 'add', path: ['active', 'value'], value: 1 }]
async function socketEndpoint(testContext) {
  const socket = { sent: [], send(message) { this.sent.push(message) }, close() {} }
  await handleConnection(socket, domain, 'repro-sid')
  await socket.onmessage({ domain, token: 'repro-token' })
  testContext.after(async () => {
    await socket.onclose()
    await turn()
  })
  return socket
}

test('completed requests release their side-effect queue after acknowledgements', async testContext => {
  const socket = await socketEndpoint(testContext)
  const count = 100
  for (let index = 0; index < count; index += 1) {
    await socket.onmessage({ scope: 'document', patch, si: index })
    await socket.onmessage({ ack: index })
  }
  assert.equal(stateful.responseBuffers[session].length, 0)
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

test('a repeated sequence number executes its mutation again', async testContext => {
  const socket = await socketEndpoint(testContext)
  const startingInteractions = interactions.length
  await socket.onmessage({ scope: 'document', patch, si: 0 })
  await socket.onmessage({ ack: 0 })
  await socket.onmessage({ scope: 'document', patch, si: 0 })
  await turn()
  assert.equal(interactions.length - startingInteractions, 2)
  const responses = socket.sent.filter(message => message?.si === 0)
  assert.equal(responses.length, 2)
  assert.notEqual(responses[0].ii, responses[1].ii)
})

test('requests queued behind one pending operation resume one at a time', async testContext => {
  const socket = await socketEndpoint(testContext)
  let releaseFirst
  let releaseFollowing
  const firstGate = new Promise(resolve => { releaseFirst = resolve })
  const followingGate = new Promise(resolve => { releaseFollowing = resolve })
  startedSideEffects = 0
  sideEffectsGate = firstGate
  const firstRequest = socket.onmessage({ scope: 'document', patch, si: 0 })
  const requests = []
  try {
    await turn()
    assert.equal(startedSideEffects, 1)
    for (let index = 1; index <= 10; index += 1) {
      requests.push(socket.onmessage({ scope: 'document', patch, si: index }))
    }
    await turn()
    assert.equal(startedSideEffects, 1)
    sideEffectsGate = followingGate
    releaseFirst()
    await turn()
    assert.equal(startedSideEffects, 2)
  }
  finally {
    releaseFirst()
    releaseFollowing()
    sideEffectsGate = undefined
    await Promise.all([firstRequest, ...requests])
  }
})

test('subscription-only updates accumulate and replay despite no-op acknowledgements', async testContext => {
  const socket = await socketEndpoint(testContext)
  await socket.onmessage({
    scope: 'sessions', si: 0,
    patch: [{ op: 'add', path: ['active', session, 'subscriptions', 'repro-subscription'], value: { scope: 'shared' } }]
  })
  await turn()
  await socket.onmessage({ ack: 0 })
  assert.equal(stateful.responseBuffers[session].length, 0)

  const count = 1000
  for (let index = 0; index < count; index += 1) {
    publications.get('resolved:shared')(JSON.stringify({ originServer: 'other-server', scope: 'shared', ii: index + 1, patch }))
  }
  await turn()
  await socket.onmessage({ ack: -1 })
  assert.equal(stateful.responseBuffers[session].length, count)
  assert.ok(stateful.responseBuffers[session].every(message => message.si === undefined))

  await socket.onclose(new Error('simulated transport loss'))
  const resumedSocket = await socketEndpoint(testContext)
  assert.equal(resumedSocket.sent.filter(message => message?.scope === 'shared').length, count)
  await resumedSocket.onmessage({ ack: -1 })
  assert.equal(stateful.responseBuffers[session].length, count)
})

test('concurrent requests do not retain or revisit completed side effects', async testContext => {
  const socket = await socketEndpoint(testContext)
  const historyCount = 1000
  const burstCount = 400
  for (let index = 0; index < historyCount; index += 1) {
    await socket.onmessage({ scope: 'document', patch, si: index })
    await socket.onmessage({ ack: index })
  }
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  globalThis.gc?.()
  const initialHeap = process.memoryUsage().heapUsed
  let peakHeap = initialHeap
  sampleHeap = () => { peakHeap = Math.max(peakHeap, process.memoryUsage().heapUsed) }
  try {
    const requests = Array.from({ length: burstCount }, (_value, index) => socket.onmessage({ scope: 'document', patch, si: historyCount + index }))
    await Promise.all(requests)
  }
  finally {
    sampleHeap = undefined
  }
  globalThis.gc?.()
  const settledHeap = process.memoryUsage().heapUsed
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  testContext.diagnostic(JSON.stringify({ historyCount, burstCount, initialHeap, peakHeap, settledHeap, forcedGC: !!globalThis.gc }))
})
