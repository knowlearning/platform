import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'

const TWO_HOURS = 2 * 60 * 60 * 1000
const fixtureKey = Symbol.for('knowlearning.idle-startup-tests')
let nextFixture = 0

async function start(context, mode) {
  context.mock.timers.enable({ apis: ['setTimeout', 'Date'], now: 0 })
  context.mock.method(performance, 'now', () => Date.now())
  const logs = []
  const errors = []
  context.mock.method(console, 'log', (...args) => logs.push(args))
  context.mock.method(console, 'error', (...args) => errors.push(args))
  const fixture = {
    exits: [], syncs: 0, metrics: {}, logs, errors,
    clearTimeout: context.mock.method(globalThis, 'clearTimeout'),
    environment: { MODE: mode, TLS_PORT: 8765, ADMIN_DOMAIN: 'admin.test' },
    requestDomain: request => new URL(request.url).hostname,
    ensureDomainConfigured: async () => {},
    CPUData: async () => ({}), getInstanceInfo: async () => ({}),
    processData: async () => ({}), networkData: async () => ({})
  }
  fixture.Agent = {
    state: async () => fixture.metrics,
    async synced() { fixture.syncs++; await fixture.syncGate }
  }
  fixture.SocketIOServer = class extends EventEmitter {
    constructor() {
      super()
      this.engine = new EventEmitter()
      fixture.io = this
    }
    handler() { return async () => new Response('Socket.IO') }
  }
  const originals = { Deno: globalThis.Deno, addEventListener: globalThis.addEventListener }
  globalThis[fixtureKey] = fixture
  globalThis.Deno = {
    serve(_options, handler) { fixture.handler = handler },
    addSignalListener(_signal, callback) { fixture.shutdown = callback },
    exit(code=0) { fixture.exits.push(code) }
  }
  globalThis.addEventListener = () => {}
  context.after(() => {
    delete globalThis[fixtureKey]
    for (const [name, value] of Object.entries(originals)) {
      if (value === undefined) delete globalThis[name]
      else globalThis[name] = value
    }
  })
  const identifier = String(++nextFixture)
  const sourceRoot = new URL('../source/', import.meta.url)
  const modules = {
    'utils.js': 'export const { environment, requestDomain, SocketIOServer } = fixture',
    'handle-http-request.js': 'export default () => new Response("OK")',
    'handle-socketio-connection.js': 'export default () => {}',
    'side-effects/configure.js': 'export const { ensureDomainConfigured } = fixture',
    'agent.js': 'export default fixture.Agent',
    'metrics.js': 'export const { CPUData, processData, networkData, getInstanceInfo } = fixture',
    'session.js': 'export default "test-server"',
    'redis.js': 'export const subscriptionRedisServer = "default"'
  }
  const mocks = new Map(Object.entries(modules).map(([path, source]) => [new URL(path, sourceRoot).href, source]))
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.includes(`startup=${identifier}`) && specifier.startsWith('.')) {
        const url = new URL(specifier, context.parentURL)
        url.searchParams.set('startup', identifier)
        return nextResolve(url.href, context)
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      const parsed = new URL(url)
      parsed.search = ''
      if (!mocks.has(parsed.href)) return nextLoad(url, context)
      const source = `const fixture = globalThis[Symbol.for('knowlearning.idle-startup-tests')];\n${mocks.get(parsed.href)}`
      return { format: 'module', source, shortCircuit: true }
    }
  })
  try { await import(new URL(`index.js?startup=${identifier}`, sourceRoot)) }
  finally { hooks.deregister() }
  fixture.elapse = async duration => {
    context.mock.timers.tick(duration)
    for (let index = 0; index < 20; index++) await Promise.resolve()
  }
  fixture.request = () => fixture.handler(new Request('https://api.test/'))
  await fixture.elapse(0)
  return fixture
}

for (const mode of ['local', 'production']) {
  test(`${mode}: Engine.IO connections count before authentication and idle restart follows mode`, async context => {
    const fixture = await start(context, mode)
    assert.equal((await fixture.request()).status, 200)
    const transport = new EventEmitter()
    fixture.io.engine.emit('connection', transport)
    await fixture.elapse(TWO_HOURS)
    assert.equal(fixture.exits.length, 0)
    assert.equal((await fixture.request()).status, 200)
    transport.emit('close')
    transport.emit('close')
    await fixture.elapse(119_999)
    assert.equal((await fixture.request()).status, 200)
    await fixture.elapse(5000)
    assert.equal((await fixture.request()).status, mode === 'production' ? 503 : 200)
    await fixture.elapse(250)
    assert.deepEqual(fixture.exits, mode === 'production' ? [0] : [])
  })
}

test('automatic shutdown rejects HTTP and waits for existing synchronization before exiting once', async context => {
  const fixture = await start(context, 'production')
  let finishSync
  fixture.syncGate = new Promise(resolve => { finishSync = resolve })
  await fixture.elapse(TWO_HOURS)
  const response = await fixture.request()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '1')
  await fixture.elapse(250)
  assert.equal(fixture.syncs, 1)
  assert.equal(fixture.exits.length, 0)
  await fixture.shutdown()
  await fixture.elapse(9999)
  assert.equal(fixture.exits.length, 0)
  finishSync()
  await fixture.elapse(0)
  assert.deepEqual(fixture.exits, [0])
  assert.equal(fixture.metrics['test-server'], undefined)
  assert.equal(fixture.clearTimeout.mock.callCount(), 1)
  assert.equal(fixture.errors.length, 0)
  assert.equal(fixture.logs.filter(([message]) => message === 'Cleanup complete.').length, 1)
  await fixture.elapse(10_000)
  assert.deepEqual(fixture.exits, [0])
})

for (const trigger of ['automatic', 'SIGTERM']) {
  for (const outcome of ['resolve', 'reject']) {
    test(`${trigger}: stalled synchronization exits at ten seconds and late ${outcome} is harmless`, async context => {
      const fixture = await start(context, trigger === 'automatic' ? 'production' : 'local')
      let finishSync
      fixture.syncGate = new Promise((resolve, reject) => {
        finishSync = outcome === 'resolve' ? resolve : reject
      })
      if (trigger === 'automatic') await fixture.elapse(TWO_HOURS)
      else fixture.shutdown()
      await fixture.elapse(250)
      assert.equal(fixture.syncs, 1)
      await fixture.shutdown()
      await fixture.elapse(9999)
      assert.deepEqual(fixture.exits, [])
      assert.equal((await fixture.request()).status, 503)
      await fixture.elapse(1)
      assert.deepEqual(fixture.exits, [1])
      assert.equal(fixture.syncs, 1)
      assert.equal(fixture.errors.length, 1)
      assert.equal(fixture.clearTimeout.mock.callCount(), 1)
      assert.equal(fixture.logs.some(([message]) => message === 'Cleanup complete.'), false)
      finishSync(new Error('late synchronization result'))
      await fixture.elapse(0)
      await fixture.shutdown()
      await fixture.elapse(10_000)
      assert.deepEqual(fixture.exits, [1])
      assert.equal(fixture.errors.length, 1)
      assert.equal(fixture.syncs, 1)
    })
  }
}

for (const failure of ['reject', 'throw']) {
  test(`synchronization ${failure} exits unsuccessfully without reporting completed cleanup`, async context => {
    const fixture = await start(context, 'production')
    fixture.Agent.synced = () => {
      fixture.syncs++
      const error = new Error('synchronization failed')
      if (failure === 'throw') throw error
      return Promise.reject(error)
    }
    await fixture.elapse(TWO_HOURS)
    await fixture.elapse(250)
    assert.deepEqual(fixture.exits, [1])
    assert.equal(fixture.syncs, 1)
    assert.equal(fixture.errors.length, 1)
    assert.equal(fixture.clearTimeout.mock.callCount(), 1)
    assert.equal(fixture.logs.some(([message]) => message === 'Cleanup complete.'), false)
    await fixture.elapse(10_000)
    assert.deepEqual(fixture.exits, [1])
  })
}
