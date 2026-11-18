import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'

const TWO_HOURS = 2 * 60 * 60 * 1000
const fixtureKey = Symbol.for('knowlearning.idle-mixed-transports-tests')
let nextFixture = 0

async function start(context) {
  context.mock.timers.enable({ apis: ['setInterval', 'Date'], now: 0 })
  context.mock.method(performance, 'now', () => Date.now())
  context.mock.method(console, 'log', () => {})
  const fixture = {
    exits: [], sockets: [], messages: [],
    environment: { MODE: 'production', TLS_PORT: 8765, ADMIN_DOMAIN: 'admin.test' },
    requestDomain: request => new URL(request.url).hostname
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
    addSignalListener() {},
    exit(code=0) { fixture.exits.push(code) },
    upgradeWebSocket() {
      const socket = new EventTarget()
      socket.readyState = 0
      fixture.sockets.push(socket)
      return { socket, response: { status: 101 } }
    }
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
    'utils.js': `
      export const { environment, requestDomain, SocketIOServer } = fixture
      export const randomBytes = () => 'test-sid'
      export const getCookies = () => ({})
    `,
    'handle-connection.js': `
      export default function handleConnection(connection) {
        connection.onmessage = message => fixture.messages.push(message)
        connection.onclose = () => {}
      }
    `,
    'side-effects/configure.js': 'export const ensureDomainConfigured = async () => {}',
    'session.js': 'export default "test-server"',
    'redis.js': 'export const subscriptionRedisServer = "default"'
  }
  const mocks = new Map(Object.entries(modules).map(([path, source]) => [new URL(path, sourceRoot).href, source]))
  const hooks = registerHooks({
    resolve(specifier, context, nextResolve) {
      if (context.parentURL?.includes(`mixed=${identifier}`) && specifier.startsWith('.')) {
        const url = new URL(specifier, context.parentURL)
        url.searchParams.set('mixed', identifier)
        return nextResolve(url.href, context)
      }
      return nextResolve(specifier, context)
    },
    load(url, context, nextLoad) {
      const parsed = new URL(url)
      parsed.search = ''
      if (!mocks.has(parsed.href)) return nextLoad(url, context)
      const source = `const fixture = globalThis[Symbol.for('knowlearning.idle-mixed-transports-tests')];\n${mocks.get(parsed.href)}`
      return { format: 'module', source, shortCircuit: true }
    }
  })
  try { await import(new URL(`index.js?mixed=${identifier}`, sourceRoot)) }
  finally { hooks.deregister() }
  fixture.elapse = duration => context.mock.timers.tick(duration)
  fixture.connectEngine = () => {
    const socket = new EventEmitter()
    socket.readyState = 'open'
    fixture.io.engine.emit('connection', socket)
    return socket
  }
  fixture.connectRaw = async () => {
    const response = await fixture.handler(new Request('https://raw.test/', { headers: { upgrade: 'websocket' } }))
    assert.equal(response.status, 101)
    return fixture.sockets.at(-1)
  }
  return fixture
}

test('sweeping Socket.IO cannot bypass an established raw WebSocket', async context => {
  const fixture = await start(context)
  const engine = fixture.connectEngine()
  const raw = await fixture.connectRaw()
  raw.readyState = 1
  fixture.elapse(TWO_HOURS)
  engine.removeAllListeners('close')
  engine.readyState = 'closed'
  fixture.elapse(5000)
  fixture.elapse(65_000)
  assert.deepEqual(fixture.exits, [])
  raw.dispatchEvent(new MessageEvent('message', { data: '{"stillConnected":true}' }))
  assert.deepEqual(fixture.messages, [{ stillConnected: true }])
  raw.readyState = 3
  raw.dispatchEvent(new Event('close'))
  fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('raw WebSocket closure cannot bypass open or closing Socket.IO transports', async context => {
  const fixture = await start(context)
  const engine = fixture.connectEngine()
  const raw = await fixture.connectRaw()
  fixture.elapse(TWO_HOURS)
  raw.readyState = 3
  raw.dispatchEvent(new Event('close'))
  for (const state of ['open', 'closing']) {
    engine.readyState = state
    fixture.elapse(70_000)
    assert.deepEqual(fixture.exits, [])
  }
  engine.removeAllListeners('close')
  engine.readyState = 'closed'
  fixture.elapse(5000)
  fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})

test('a raw WebSocket arriving at the swept Socket.IO grace boundary cancels restart', async context => {
  const fixture = await start(context)
  const engine = fixture.connectEngine()
  fixture.elapse(TWO_HOURS)
  engine.removeAllListeners('close')
  engine.readyState = 'closed'
  fixture.elapse(5000)
  fixture.elapse(64_999)
  const raw = await fixture.connectRaw()
  fixture.elapse(1)
  assert.deepEqual(fixture.exits, [])
  raw.readyState = 3
  raw.dispatchEvent(new Event('close'))
  fixture.elapse(64_999)
  assert.deepEqual(fixture.exits, [])
  fixture.elapse(1)
  assert.deepEqual(fixture.exits, [0])
})
