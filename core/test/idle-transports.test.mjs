import test from 'node:test'
import assert from 'node:assert/strict'
import { EventEmitter } from 'node:events'
import { registerHooks } from 'node:module'
import { shouldRestart } from '../source/idle-restart.js'

let time = performance.now() + 2 * 60 * 60 * 1000

const sources = new Map([
  [new URL('../source/utils.js', import.meta.url).href, `
    export const randomBytes = () => 'test-sid'
    export const getCookies = () => ({})
    export const requestDomain = () => 'test.example'
  `],
  [new URL('../source/handle-connection.js', import.meta.url).href, `
    import { shouldRestart } from './idle-restart.js'
    export const connections = []
    export default function handleConnection(connection) {
      const record = { restartAtSetup: shouldRestart(), closes: 0, messages: [] }
      connections.push(record)
      connection.onclose = reason => { record.closes++; record.closeReason = reason }
      connection.onmessage = message => { record.messages.push(message) }
    }
  `]
])
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return sources.has(url)
      ? { format: 'module', source: sources.get(url), shortCircuit: true }
      : nextLoad(url, context)
  }
})
const { default: handleHTTPRequest } = await import('../source/handle-http-request.js')
const { default: handleSocketIOConnection } = await import('../source/handle-socketio-connection.js')
const { connections } = await import('../source/handle-connection.js')
hooks.deregister()

function harness(context) {
  const originalDeno = globalThis.Deno
  const sockets = []
  connections.length = 0
  time += 65_000
  context.mock.method(performance, 'now', () => time)
  context.mock.method(console, 'log', () => {})
  globalThis.Deno = {
    upgradeWebSocket() {
      const socket = new EventTarget()
      socket.readyState = 0
      sockets.push(socket)
      return { socket, response: { status: 101 } }
    }
  }
  context.after(() => {
    sockets.forEach(socket => socket.dispatchEvent(new Event('close')))
    if (originalDeno === undefined) delete globalThis.Deno
    else globalThis.Deno = originalDeno
  })
  return {
    sockets,
    advance(duration) { time += duration },
    request(upgrade=false) {
      return handleHTTPRequest(new Request('https://test.example/', {
        headers: upgrade ? { upgrade: 'websocket' } : {}
      }))
    }
  }
}

for (const opened of [false, true]) {
  test(`raw WebSocket counts before authentication and releases once ${opened ? 'after' : 'before'} open`, async context => {
    const { request, sockets, advance } = harness(context)
    assert.equal(shouldRestart(), true)
    assert.equal(request(true).status, 101)
    assert.equal(shouldRestart(), false)
    assert.equal(connections[0].restartAtSetup, false)
    if (opened) sockets[0].dispatchEvent(new Event('open'))
    await Promise.resolve()
    assert.equal(shouldRestart(), false)
    sockets[0].dispatchEvent(new Event('close'))
    assert.equal(shouldRestart(), false)
    request(true)
    sockets[0].dispatchEvent(new Event('close'))
    advance(65_000)
    await Promise.resolve()
    assert.equal(shouldRestart(), false)
    assert.equal(connections[0].closes, 1)
    sockets[1].dispatchEvent(new Event('close'))
    assert.equal(shouldRestart(), false)
    advance(64_999)
    sockets[1].dispatchEvent(new Event('close'))
    assert.equal(shouldRestart(), false)
    advance(1)
    assert.equal(shouldRestart(), true)
  })
}

test('plain HTTP does not register a persistent connection', async context => {
  const { request, sockets } = harness(context)
  assert.equal(shouldRestart(), true)
  const response = request()
  assert.equal(response.status, 200)
  assert.equal(await response.text(), 'WebSocket API Available')
  assert.equal(shouldRestart(), true)
  assert.equal(connections.length, 0)
  assert.equal(sockets.length, 0)
})

test('raw WebSocket errors preserve the connection until close and report the error once', context => {
  const { request, sockets, advance } = harness(context)
  request(true)
  const error = new Event('error')
  error.toString = () => 'transport failed'
  sockets[0].dispatchEvent(error)
  advance(65_000)
  assert.equal(shouldRestart(), false)
  assert.equal(connections[0].closes, 0)
  sockets[0].dispatchEvent(new MessageEvent('message', { data: '{"hello":"world"}' }))
  assert.deepEqual(connections[0].messages, [{ hello: 'world' }])
  sockets[0].dispatchEvent(new Event('close'))
  sockets[0].dispatchEvent(new Event('close'))
  assert.equal(connections[0].closes, 1)
  assert.equal(connections[0].closeReason, 'transport failed')
  advance(65_000)
  assert.equal(shouldRestart(), true)
})

for (const errored of [false, true]) {
  test(`Socket.IO handles messages and ${errored ? 'error' : 'normal'} disconnect without metrics`, context => {
    harness(context)
    const socket = new EventEmitter()
    socket.handshake = { headers: {} }
    socket.connected = true
    handleSocketIOConnection(socket)
    socket.emit('message', { hello: 'world' })
    assert.deepEqual(connections[0].messages, [{ hello: 'world' }])
    if (errored) socket.emit('error', new Error('transport failed'))
    socket.emit('disconnect', 'transport close')
    socket.emit('disconnect', 'transport close')
    assert.equal(connections[0].closes, 1)
    assert.equal(connections[0].closeReason, errored ? 'Error: transport failed' : 'transport close')
  })
}
