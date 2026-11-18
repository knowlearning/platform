import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'

const TWO_HOURS = 2 * 60 * 60 * 1000
const fixtureKey = Symbol.for('knowlearning.idle-startup-tests')
let nextFixture = 0

async function start(context, mode, environment={}) {
  context.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'], now: 0 })
  context.mock.method(performance, 'now', () => Date.now())
  const logs = []
  const errors = []
  context.mock.method(console, 'log', (...args) => logs.push(args))
  context.mock.method(console, 'error', (...args) => errors.push(args))
  const fixture = {
    exits: [], writes: [], signals: new Map(), logs, errors,
    setInterval: context.mock.method(globalThis, 'setInterval'),
    clearInterval: context.mock.method(globalThis, 'clearInterval'),
    environment: { MODE: mode, TLS_PORT: 8765, ADMIN_DOMAIN: 'admin.test', ...environment },
    requestDomain: request => new URL(request.url).hostname,
    ensureDomainConfigured: async () => {}
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
    addSignalListener(signal, callback) { fixture.signals.set(signal, callback) },
    async writeTextFile(...args) { fixture.writes.push(args) },
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
    'session.js': 'export default "test-server"',
    'redis.js': 'export const subscriptionRedisServer = "default"'
  }
  const mocks = new Map(Object.entries(modules).map(([path, source]) => [new URL(path, sourceRoot).href, source]))
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.includes(`startup=${identifier}`) && specifier.startsWith('.')) {
        const url = new URL(specifier, context.parentURL)
        assert.equal(['agent.js', 'metrics.js'].some(path => url.pathname === new URL(path, sourceRoot).pathname), false, 'startup must not import removed server metrics modules')
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
  fixture.request = (url='https://api.test/', options) => fixture.handler(new Request(url, options))
  fixture.shutdown = fixture.signals.get('SIGTERM')
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
    await fixture.elapse(64_999)
    assert.equal((await fixture.request()).status, 200)
    await fixture.elapse(1)
    assert.equal((await fixture.request()).status, mode === 'production' ? 503 : 200)
    assert.deepEqual(fixture.exits, mode === 'production' ? [0] : [])
  })
}

test('production startup needs no metrics modules and restarts exactly at two hours', async context => {
  const fixture = await start(context, 'production')
  assert.equal(fixture.setInterval.mock.callCount(), 1)
  assert.equal(fixture.setInterval.mock.calls[0].arguments[1], 5000)
  await fixture.elapse(TWO_HOURS - 1)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
  const response = await fixture.request()
  assert.equal(response.status, 503)
  assert.equal(response.headers.get('retry-after'), '1')
  fixture.shutdown()
  await fixture.elapse(TWO_HOURS)
  assert.deepEqual(fixture.exits, [0])
  assert.equal(fixture.clearInterval.mock.callCount(), 1)
  assert.equal(fixture.errors.length, 0)
  assert.equal(fixture.logs.filter(([message]) => message === 'Restarting API server after sustained inactivity.').length, 1)
  assert.equal(fixture.logs.filter(([message]) => message === 'Shutting down API server.').length, 1)
})

for (const mode of ['local', 'staging', undefined]) {
  test(`${mode}: no automatic restart interval is started outside production`, async context => {
    const fixture = await start(context, mode)
    assert.equal(fixture.setInterval.mock.callCount(), 0)
    await fixture.elapse(24 * 60 * 60 * 1000)
    assert.deepEqual(fixture.exits, [])
    assert.equal((await fixture.request()).status, 200)
  })
}

test('reconnection during the grace period postpones restart until all connections close again', async context => {
  const fixture = await start(context, 'production')
  const first = new EventEmitter()
  fixture.io.engine.emit('connection', first)
  await fixture.elapse(TWO_HOURS)
  first.emit('close')
  await fixture.elapse(60_000)
  const second = new EventEmitter()
  const third = new EventEmitter()
  fixture.io.engine.emit('connection', second)
  fixture.io.engine.emit('connection', third)
  await fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [])
  second.emit('close')
  await fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [])
  third.emit('close')
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('the independent timer honors a reconnection grace longer than 65 seconds', async context => {
  const fixture = await start(context, 'production', { SESSION_RECONNECTION_INTERVAL: '90000' })
  const transport = new EventEmitter()
  fixture.io.engine.emit('connection', transport)
  await fixture.elapse(TWO_HOURS)
  transport.emit('close')
  await fixture.elapse(90_000)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(5000)
  assert.deepEqual(fixture.exits, [0])
})

for (const removeListeners of [false, true]) {
  test(`a closed transport with ${removeListeners ? 'removed close listeners' : 'no close event'} starts a fresh grace period when swept`, async context => {
    const fixture = await start(context, 'production')
    const transport = new EventEmitter()
    transport.readyState = 'open'
    fixture.io.engine.emit('connection', transport)
    const delayedClose = transport.listeners('close')[0]
    await fixture.elapse(TWO_HOURS)
    if (removeListeners) transport.removeAllListeners('close')
    transport.readyState = 'closed'
    await fixture.elapse(5000)
    assert.deepEqual(fixture.exits, [])
    await fixture.elapse(64_999)
    assert.deepEqual(fixture.exits, [])
    delayedClose()
    delayedClose()
    await fixture.elapse(1)
    assert.deepEqual(fixture.exits, [0])
    await fixture.elapse(65_000)
    assert.deepEqual(fixture.exits, [0])
  })
}

test('the sweep never releases transports in nonterminal or unknown states', async context => {
  const fixture = await start(context, 'production')
  const transport = new EventEmitter()
  fixture.io.engine.emit('connection', transport)
  transport.removeAllListeners('close')
  await fixture.elapse(TWO_HOURS)
  for (const state of ['opening', 'open', 'closing', undefined, null, 'unknown', 'CLOSED', 3]) {
    transport.readyState = state
    await fixture.elapse(70_000)
    assert.deepEqual(fixture.exits, [], `readyState=${state}`)
  }
  transport.readyState = 'closed'
  await fixture.elapse(5000)
  await fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [0])
})

test('sweeping one transport and receiving its late close cannot release another live connection', async context => {
  const fixture = await start(context, 'production')
  const stale = new EventEmitter()
  const live = new EventEmitter()
  stale.readyState = live.readyState = 'open'
  fixture.io.engine.emit('connection', stale)
  fixture.io.engine.emit('connection', live)
  const delayedClose = stale.listeners('close')[0]
  await fixture.elapse(TWO_HOURS)
  stale.removeAllListeners('close')
  stale.readyState = 'closed'
  await fixture.elapse(5000)
  delayedClose()
  delayedClose()
  await fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [])
  live.emit('close')
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('reconnection at the swept transport grace boundary prevents restart and resets the grace', async context => {
  const fixture = await start(context, 'production')
  const stale = new EventEmitter()
  fixture.io.engine.emit('connection', stale)
  await fixture.elapse(TWO_HOURS)
  stale.removeAllListeners('close')
  stale.readyState = 'closed'
  await fixture.elapse(5000)
  await fixture.elapse(64_999)
  const reconnect = new EventEmitter()
  reconnect.readyState = 'open'
  fixture.io.engine.emit('connection', reconnect)
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [])
  reconnect.emit('close')
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('sweeping a closed transport does not bypass minimum uptime', async context => {
  const fixture = await start(context, 'production')
  const transport = new EventEmitter()
  fixture.io.engine.emit('connection', transport)
  transport.removeAllListeners('close')
  transport.readyState = 'closed'
  await fixture.elapse(5000)
  await fixture.elapse(TWO_HOURS - 5001)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('a swept transport still receives the configured longer reconnection grace', async context => {
  const fixture = await start(context, 'production', { SESSION_RECONNECTION_INTERVAL: '90000' })
  const transport = new EventEmitter()
  fixture.io.engine.emit('connection', transport)
  await fixture.elapse(TWO_HOURS)
  transport.removeAllListeners('close')
  transport.readyState = 'closed'
  await fixture.elapse(5000)
  await fixture.elapse(90_000)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(4999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('a sweep cleans an entire mixed close batch without retaining retired entries', async context => {
  const fixture = await start(context, 'production')
  const records = Array.from({ length: 32 }, () => {
    const record = { socket: new EventEmitter(), state: 'open', reads: 0 }
    Object.defineProperty(record.socket, 'readyState', {
      get() { record.reads++; return record.state }
    })
    fixture.io.engine.emit('connection', record.socket)
    return record
  })
  const blocker = new EventEmitter()
  blocker.readyState = 'open'
  fixture.io.engine.emit('connection', blocker)
  await fixture.elapse(TWO_HOURS)
  for (const [index, record] of records.entries()) {
    record.state = 'closed'
    if (index % 3 === 0) record.socket.emit('close')
    else if (index % 3 === 1) record.socket.removeAllListeners('close')
    record.expectedReads = record.reads + Number(index % 3 !== 0)
  }
  await fixture.elapse(5000)
  for (const record of records) assert.equal(record.reads, record.expectedReads)
  await fixture.elapse(60_000)
  for (const record of records) assert.equal(record.reads, record.expectedReads)
  assert.deepEqual(fixture.exits, [])
  blocker.readyState = 'closed'
  blocker.emit('close')
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
  for (const record of records) assert.equal(record.reads, record.expectedReads)
})

test('staggered silent closes start grace only when the final transport is swept', async context => {
  const fixture = await start(context, 'production')
  const first = new EventEmitter()
  const last = new EventEmitter()
  first.readyState = last.readyState = 'open'
  fixture.io.engine.emit('connection', first)
  fixture.io.engine.emit('connection', last)
  first.removeAllListeners('close')
  last.removeAllListeners('close')
  await fixture.elapse(TWO_HOURS)
  first.readyState = 'closed'
  await fixture.elapse(5000)
  await fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  last.readyState = 'closed'
  await fixture.elapse(4999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('a delayed sweep starts fresh grace rather than assuming the transport was already idle', async context => {
  const fixture = await start(context, 'production')
  const transport = new EventEmitter()
  transport.readyState = 'open'
  fixture.io.engine.emit('connection', transport)
  await fixture.elapse(TWO_HOURS)
  transport.removeAllListeners('close')
  transport.readyState = 'closed'
  context.mock.timers.setTime(Date.now() + TWO_HOURS)
  fixture.setInterval.mock.calls[0].arguments[0]()
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('a transport already closed when registered still receives a fresh idle grace', async context => {
  const fixture = await start(context, 'production')
  await fixture.elapse(TWO_HOURS - 5000)
  const transport = new EventEmitter()
  transport.readyState = 'closed'
  fixture.io.engine.emit('connection', transport)
  await fixture.elapse(5000)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

for (const mode of ['local', 'production']) {
  test(`${mode}: SIGTERM is registered at startup and exits once without synchronization`, async context => {
    const fixture = await start(context, mode)
    assert.equal(typeof fixture.shutdown, 'function')
    fixture.io.engine.emit('connection', new EventEmitter())
    fixture.shutdown()
    assert.deepEqual(fixture.exits, [0])
    fixture.shutdown()
    await fixture.elapse(TWO_HOURS)
    assert.deepEqual(fixture.exits, [0])
    assert.equal((await fixture.request()).status, 503)
    assert.equal(fixture.errors.length, 0)
    assert.equal(fixture.logs.filter(([message]) => message === 'Shutting down API server.').length, 1)
    assert.equal(fixture.logs.some(([message]) => message === 'Restarting API server after sustained inactivity.'), false)
  })
}

test('local development restart responds before its delayed shutdown', async context => {
  const fixture = await start(context, 'local', { DEV_CONTROL_TOKEN: 'test-control-token' })
  const response = await fixture.request('https://api.test/_dev/restart', {
    method: 'POST',
    headers: { 'x-dev-control-token': 'test-control-token' }
  })
  assert.equal(response.status, 202)
  assert.equal((await response.json()).restarting, true)
  assert.deepEqual(fixture.writes, [['/tmp/knowlearning-core-inspect-mode', 'inspect\n']])
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(99)
  assert.deepEqual(fixture.exits, [])
  await fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
  fixture.shutdown()
  await fixture.elapse(TWO_HOURS)
  assert.deepEqual(fixture.exits, [0])
})
