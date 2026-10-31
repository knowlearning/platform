import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { registerHooks } from 'node:module'

// Run both real entrypoints and the real interaction validator. Only external
// services are replaced, with gates that make the ordering observable.
const domain = 'reports.test', user = 'test-user', session = 'test-session'
const fixtureName = Symbol.for('knowlearning.authentication-ordering-test')
const events = [], workers = [], metadataIds = []
let gates, started, metadataReads, rejectMetadataRead, interactionIndex
function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}
const turn = () => new Promise(resolve => setImmediate(resolve))
async function waitFor(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((_, reject) => { timer = setTimeout(() => reject(new Error('Ordering milestone was not reached')), 1000) })
    ])
  }
  finally { clearTimeout(timer) }
}

globalThis[fixtureName] = {
  environment: { ADMIN_DOMAIN: 'admin.test', SUPER_ADMINS: [], HEARTBEAT_INTERVAL: 3600000 },
  uuid: randomUUID,
  isUUID: value => /^[0-9a-f-]{36}$/i.test(value),
  decryptString: (_key, value) => value,
  jwt: { sign: (_claims, _key, _options, callback) => callback(null, 'test-jwt') },
  authenticate: async () => ({ user, session, provider: 'google', info: {} }),
  scopeToId: async (_domain, _user, scope) => `resolved:${scope}`,
  async getState(_domain, id, { path } = {}) {
    if (!path) return { active: {} }
    metadataIds.push(id)
    events.push('validation:start')
    started.validation.resolve()
    const read = ++metadataReads
    await gates.validation?.promise
    events.push('validation:complete')
    const values = { domain, owner: read === rejectMetadataRead ? 'another-user' : user, active_type: 'application/json' }
    return Object.fromEntries(path.map(key => [key, [values[key.slice(2)]]]))
  },
  async patchState() {
    events.push('persistence:start')
    started.persistence.resolve()
    await gates.persistence?.promise
    events.push('persistence:complete')
    started.persisted.resolve()
    return { ii: ++interactionIndex, type: 'application/json' }
  },
  async handleSideEffects() {
    events.push('effects:start')
    started.effects.resolve()
    await gates.effects?.promise
    events.push('effects:complete')
    return { worked: true }
  },
  async coreSideEffects({ send, si, ii }) { await send({ si, ii }) },
  isolatedWorker() {
    const worker = { sent: [], async postMessage(message) { this.sent.push(message) }, terminate() {} }
    workers.push(worker)
    return worker
  }
}
const stub = names => `const fixture = globalThis[Symbol.for('knowlearning.authentication-ordering-test')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map()
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const mockDefault = (path, name) => mock(path, `${stub([name])}\nexport default ${name};`)
mock('utils.js', stub(['environment', 'uuid', 'isUUID', 'decryptString', 'jwt']))
mock('persistence.js', stub(['getState', 'patchState']))
for (const [path, name] of [
  ['authenticate/index.js', 'authenticate'], ['scope-to-id.js', 'scopeToId'],
  ['handle-side-effects.js', 'handleSideEffects'], ['core-side-effects.js', 'coreSideEffects'],
  ['isolated-worker.js', 'isolatedWorker']
]) mockDefault(path, name)
mock('session.js', 'export default "test-server"')
mock('subscribe.js', 'export default () => () => {}')
mock('authorize.js', 'export default async () => true')
mock('handle-guarantee.js', 'export default async () => {}')
mock('domain-agent/index.js', 'export default async () => null')
mock('configuration.js', 'export default async () => ({ secrets: {} })')
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url) ? { format: 'module', source: mocks.get(url), shortCircuit: true } : nextLoad(url, context)
  }
})
const { default: handleConnection } = await import('../source/handle-connection.js')
const { default: executeWorkerScript } = await import('../source/execute-worker-script.js')
const stateful = await import('../source/stateful.js')
hooks.deregister()

beforeEach(() => {
  events.length = workers.length = metadataIds.length = 0
  gates = {}
  started = Object.fromEntries(['validation', 'persistence', 'persisted', 'effects'].map(name => [name, deferred()]))
  metadataReads = interactionIndex = 0
  rejectMetadataRead = null
  for (const name of ['domainWorkers', 'domainWorkerResponses', 'activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers', 'outstandingSideEffects', 'subscriptions']) {
    for (const key of Object.keys(stateful[name])) delete stateful[name][key]
  }
})
after(() => { delete globalThis[fixtureName] })

const allowedPatch = [{ op: 'add', path: ['active', 'value'], value: 1 }]
const forbiddenPatch = [{ op: 'replace', path: ['owner'], value: 'another-user' }]
async function socketEndpoint(t) {
  const socket = { sent: [], send(message) { this.sent.push(message) }, close() {} }
  await handleConnection(socket, domain, 'test-sid')
  await socket.onmessage({ domain, token: 'test-token' })
  assert.equal(socket.sent[0].auth.user, user)
  t.after(async () => {
    for (const gate of Object.values(gates)) gate.resolve()
    await socket.onclose()
    await turn()
  })
  let si = 0
  return { sent: socket.sent, request: patch => socket.onmessage({ scope: 'document', patch, context: [], si: si++ }) }
}
async function workerEndpoint() {
  const running = executeWorkerScript(false, domain, user, 'test-script', {}, session, [], ['tenant'])
  const worker = workers.at(-1)
  const script = worker.sent.find(message => message.type === 'script')
  await worker.onmessage({ data: { type: 'respond', id: script.id, response: null } })
  await running
  let requestId = 0
  return { sent: worker.sent, request: patch => worker.onmessage({ data: {
    type: 'interact', scope: 'document', patch, runId: 'test-run', requestId: ++requestId
  } }) }
}

for (const [name, endpoint] of [['socket', socketEndpoint], ['worker', workerEndpoint]]) {
  test(`${name}: preflight finishes before effects, then effects overlap persistence`, async t => {
    const client = await endpoint(t)
    gates = { validation: deferred(), persistence: deferred(), effects: deferred() }
    let completed = false
    const request = client.request(allowedPatch).then(() => { completed = true })
    await waitFor(started.validation.promise)
    await turn()
    assert.deepEqual(events, ['validation:start'])

    gates.validation.resolve()
    await waitFor(started.persistence.promise)
    assert.ok(events.indexOf('effects:start') < events.indexOf('persistence:start'))
    assert.equal(events.includes('effects:complete'), false)
    assert.equal(events.includes('persistence:complete'), false)
    assert.equal(completed, false)

    gates.persistence.resolve()
    await waitFor(started.persisted.promise)
    await turn()
    assert.equal(completed, false)
    gates.effects.resolve()
    await waitFor(request)
    assert.equal(metadataReads, 2) // Preflight plus the write boundary's own check.
    const expectedId = name === 'socket' ? 'resolved:document' : 'resolved:tenant/document'
    assert.deepEqual(metadataIds, [expectedId, expectedId])
  })

  test(`${name}: rejected preflight starts no effects or persistence and a later request succeeds`, async t => {
    const client = await endpoint(t)
    gates.validation = deferred()
    const rejected = client.request(forbiddenPatch)
    await waitFor(started.validation.promise)
    await turn()
    assert.deepEqual(events, ['validation:start'])
    gates.validation.resolve()
    await waitFor(rejected)
    assert.deepEqual(events, ['validation:start', 'validation:complete'])

    await waitFor(client.request(allowedPatch))
    assert.equal(interactionIndex, 1)
    assert.ok(events.includes('effects:complete'))
  })
}

test('socket releases a late-rejected request after its already-running effects settle', async t => {
  const client = await socketEndpoint(t)
  gates.effects = deferred()
  rejectMetadataRead = 2
  await waitFor(client.request(allowedPatch))
  assert.ok(events.includes('effects:start'))
  assert.equal(events.includes('effects:complete'), false)
  assert.equal(events.includes('persistence:start'), false)
  assert.ok(client.sent.some(message => message?.si === 0 && message.error))

  rejectMetadataRead = null
  const following = client.request(allowedPatch)
  await turn()
  assert.equal(metadataReads, 2)
  assert.equal(interactionIndex, 0)
  gates.effects.resolve()
  await waitFor(following)
  assert.equal(interactionIndex, 1)
  assert.ok(client.sent.some(message => message?.si === 1 && message.ii === 1))
})
