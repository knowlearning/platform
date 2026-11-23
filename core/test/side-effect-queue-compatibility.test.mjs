import test, { beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const fixtureName = Symbol.for('knowlearning.queue-compatibility')
const domain = 'queue-compatibility.test', user = 'queue-user', session = 'queue-session'
const effects = new Map(), started = new Map(), publications = new Map(), types = new Map()
let socket, messageIndex, interactionIndex, coreStateGate

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const turn = () => new Promise(resolve => setImmediate(resolve))
async function waitFor(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Queue compatibility milestone was not reached')), 1000) })
    ])
  }
  finally { clearTimeout(timer) }
}

function effectStarted(label) {
  if (!started.has(label)) started.set(label, deferred())
  return started.get(label)
}

globalThis[fixtureName] = {
  environment: { ADMIN_DOMAIN: domain, MODE: 'local', SUPER_ADMINS: [], HEARTBEAT_INTERVAL: 3600000 },
  jwt: { sign: (claims, key, options, callback) => callback(null, 'queue-jwt') },
  uuid: () => 'queue-uuid',
  isUUID: () => false,
  randomBytes: () => 'queue-token',
  PatchProxy: class {},
  authenticate: async () => ({ user, session, provider: 'test', info: {} }),
  scopeToId: async (requestDomain, requestUser, scope) => `resolved:${scope}`,
  assertInteractionAllowed: async () => {},
  interact: async (requestDomain, requestUser, scope) => ({ ii: ++interactionIndex, active_type: types.get(scope) || 'application/json' }),
  handleSideEffects: ({ context: [label] }) => {
    effectStarted(label).resolve()
    return effects.get(label)?.promise || Promise.resolve({ label })
  },
  getState: async () => ({ active: { value: 42 } }),
  coreState: async () => {
    coreStateGate?.started.resolve()
    await coreStateGate?.promise
    return {}
  },
  setState: async () => {},
  subscribe: (id, callback) => publications.set(id, callback),
  configuredQuery: async (requestDomain, targetDomain, query) => {
    if (query === 'invalid') throw new Error('INVALID QUERY TARGET DOMAIN')
    return { rows: [{ query }] }
  },
  upload: async () => ({ url: 'https://storage.test/upload', info: {} }),
  download: async () => 'https://storage.test/download'
}

const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map()
const stub = names => `const fixture = globalThis[Symbol.for('knowlearning.queue-compatibility')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const mockDefault = (path, name) => mock(path, `${stub([name])}\nexport default ${name};`)
mock('utils.js', stub(['environment', 'jwt', 'uuid', 'isUUID', 'randomBytes', 'PatchProxy']))
mock('persistence.js', stub(['getState', 'setState', 'subscribe']))
mock('interact.js', `${stub(['interact', 'assertInteractionAllowed'])}\nexport default interact;`)
for (const [path, name] of [
  ['authenticate/index.js', 'authenticate'], ['scope-to-id.js', 'scopeToId'],
  ['handle-side-effects.js', 'handleSideEffects'], ['configured-query.js', 'configuredQuery']
]) mockDefault(path, name)
mock('storage.js', stub(['upload', 'download']))
mock('session.js', 'export default "queue-server"')
mock('authorize.js', 'export default async () => true')
mock('handle-guarantee.js', 'export default async () => {}')
mock('domain-agent/index.js', 'export default async () => null')
mock('initialization-state.js', 'export default () => ({})')
mock('side-effects/configure.js', 'export const applyConfiguration = async () => {}; export const prepareStorageForConfiguration = async () => {}; export default async ({ send, si, ii }) => { send({ si, ii }); };')
mock('core-state.js', `${stub(['coreState'])}\nexport const coreStateSynced = async () => {}; export default coreState;`)
mock('configuration.js', 'export const domainAdmin = async () => "admin-user";')
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url) ? { format: 'module', source: mocks.get(url), shortCircuit: true } : nextLoad(url, context)
  }
})
const { default: handleConnection } = await import('../source/handle-connection.js')
const stateful = await import('../source/stateful.js')
hooks.deregister()

beforeEach(async () => {
  effects.clear()
  started.clear()
  publications.clear()
  types.clear()
  coreStateGate = undefined
  messageIndex = interactionIndex = 0
  for (const name of ['activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers', 'outstandingSideEffects', 'reconnectionPromiseResolvers', 'subscriptions', 'subscriptionResponses', 'guarantees']) {
    for (const key of Object.keys(stateful[name])) delete stateful[name][key]
  }
  socket = { sent: [], send(message) { this.sent.push(message) }, close() {} }
  await handleConnection(socket, domain, 'queue-sid')
  await socket.onmessage({ domain, token: 'queue-token' })
})
afterEach(async () => {
  for (const effect of effects.values()) effect.resolve()
  coreStateGate?.resolve()
  await turn()
  await socket.onclose()
  await turn()
})
after(() => { delete globalThis[fixtureName] })

function request(label, scope, patch) {
  return socket.onmessage({ scope, patch, context: [label], si: messageIndex++ })
}

const queryPatch = query => [{ op: 'add', path: ['active', session, 'queries', query], value: { query } }]
const valuePatch = [{ op: 'add', path: ['active', 'value'], value: 1 }]

for (const query of ['valid', 'invalid']) {
  test(`${query} queries do not hold later session operations behind their domain scripts`, async () => {
    const blocked = deferred()
    effects.set('first', blocked)
    await waitFor(request('first', 'sessions', queryPatch(query)))
    const response = socket.sent.find(message => message.si === 0)
    if (query === 'valid') assert.deepEqual(response.rows, [{ query }])
    else assert.equal(response.error, 'INVALID QUERY TARGET DOMAIN')
    await waitFor(request('following', 'sessions', queryPatch('following')))
    assert.deepEqual(socket.sent.find(message => message.si === 1).rows, [{ query: 'following' }])
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

for (const [name, scope, activeType, patch] of [
  ['session metadata', 'sessions', 'application/json', valuePatch],
  ['configuration', 'configuration/target.test', 'application/json', valuePatch],
  ['upload', 'transfer', 'application/json;type=upload', [{ op: 'add', path: ['active'], value: { id: 'upload-id', type: 'text/plain' } }]],
  ['download metadata', 'transfer', 'application/json;type=download', valuePatch],
  ['claim metadata', 'claim', 'application/json;type=domain-claim', valuePatch]
]) {
  test(`${name} preserves queue release before its deferred response`, async () => {
    types.set(scope, activeType)
    const blocked = deferred()
    effects.set('first', blocked)
    await waitFor(request('first', scope, patch))
    assert.equal(socket.sent.some(message => message.si === 0), false)
    await waitFor(request('following', scope, patch))
    assert.ok(socket.sent.some(message => message.si === 1))
    blocked.resolve({ label: 'first' })
    await turn()
    assert.deepEqual(socket.sent.find(message => message.si === 0).response, { label: 'first' })
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

for (const [name, activeType, patch] of [
  ['JSON mutation', 'application/json', valuePatch],
  ['download request', 'application/json;type=download', [{ op: 'add', path: ['active'], value: { id: 'download-id' } }]]
]) {
  test(`${name} still holds the queue until its awaited response completes`, async () => {
    types.set('document', activeType)
    const blocked = deferred()
    effects.set('first', blocked)
    const first = request('first', 'document', patch)
    await waitFor(effectStarted('first').promise)
    const following = request('following', 'document', patch)
    await turn()
    assert.equal(started.has('following'), false)
    assert.equal(socket.sent.some(message => message.si === 0), false)
    blocked.resolve({ label: 'first' })
    await waitFor(Promise.all([first, following]))
    assert.deepEqual(socket.sent.filter(message => message.si !== undefined).map(message => message.si), [0, 1])
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

test('guarantee registration releases the queue without sending a response', async () => {
  const blocked = deferred()
  effects.set('guarantee', blocked)
  const guarantee = { scope: 'document', patch: valuePatch }
  await waitFor(request('guarantee', 'sessions', [{ op: 'add', path: ['active', session, 'guarantees', 'cleanup'], value: guarantee }]))
  assert.deepEqual(stateful.guarantees[session].cleanup, guarantee)
  assert.equal(socket.sent.some(message => message.si === 0), false)
  await waitFor(request('following', 'sessions', queryPatch('following')))
  assert.ok(socket.sent.some(message => message.si === 1))
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

test('a claim response does not release the queue before core processing finishes', async () => {
  types.set('claim', 'application/json;type=domain-claim')
  coreStateGate = { ...deferred(), started: deferred() }
  const first = request('first', 'claim', [{ op: 'add', path: ['active'], value: { domain: 'claimed.test' } }])
  await waitFor(coreStateGate.started.promise)
  await turn()
  assert.equal(socket.sent.find(message => message.si === 0).token, 'queue-token')
  const following = request('following', 'claim', valuePatch)
  await turn()
  assert.equal(started.has('following'), false)
  coreStateGate.resolve()
  await waitFor(Promise.all([first, following]))
  assert.ok(socket.sent.some(message => message.si === 1))
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

test('subscription replies and later updates retain their original effect result after queue cleanup', async () => {
  const blocked = deferred()
  effects.set('subscription', blocked)
  await waitFor(request('subscription', 'sessions', [{
    op: 'add', path: ['active', session, 'subscriptions', 'watch'], value: { scope: 'document' }
  }]))
  assert.equal(socket.sent.some(message => message.si === 0), false)
  await waitFor(request('following', 'sessions', queryPatch('following')))
  assert.ok(socket.sent.some(message => message.si === 1))
  const failure = new Error('script failed')
  blocked.reject(failure)
  await turn()
  const initial = socket.sent.find(message => message.si === 0)
  assert.deepEqual(initial.active, { value: 42 })
  assert.deepEqual(initial.log, [failure])
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  publications.get('resolved:document')(JSON.stringify({ originServer: 'another-server', patch: valuePatch, ii: 123 }))
  await turn()
  const update = socket.sent.find(message => message.ii === 123)
  assert.deepEqual(update.patch, valuePatch)
  assert.deepEqual(update.log, [failure])
  assert.equal(update.scope, 'document')
})
