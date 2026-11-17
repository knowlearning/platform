import test from 'node:test'
import assert from 'node:assert/strict'
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
      const record = { restartAtSetup: shouldRestart(), closes: 0 }
      connections.push(record)
      connection.onclose = () => { record.closes++ }
      connection.onmessage = () => {}
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
const { connections } = await import('../source/handle-connection.js')
hooks.deregister()

function harness(context) {
  const originalDeno = globalThis.Deno
  const sockets = []
  const metrics = { websockets: { opened: 0, closed: 0, errored: 0 } }
  connections.length = 0
  time += 120_000
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
    sockets, metrics,
    advance(duration) { time += duration },
    request(upgrade=false) {
      return handleHTTPRequest(new Request('https://test.example/', {
        headers: upgrade ? { upgrade: 'websocket' } : {}
      }), Promise.resolve(metrics))
    }
  }
}

for (const opened of [false, true]) {
  test(`raw WebSocket counts before authentication and releases once ${opened ? 'after' : 'before'} open`, async context => {
    const { request, sockets, metrics, advance } = harness(context)
    assert.equal(shouldRestart(), true)
    assert.equal(request(true).status, 101)
    assert.equal(shouldRestart(), false)
    assert.equal(connections[0].restartAtSetup, false)
    assert.equal(metrics.websockets.opened, 0)
    if (opened) sockets[0].dispatchEvent(new Event('open'))
    await Promise.resolve()
    assert.equal(shouldRestart(), false)
    assert.equal(metrics.websockets.opened, Number(opened))
    sockets[0].dispatchEvent(new Event('close'))
    assert.equal(shouldRestart(), false)
    request(true)
    sockets[0].dispatchEvent(new Event('close'))
    advance(120_000)
    await Promise.resolve()
    assert.equal(shouldRestart(), false)
    assert.equal(connections[0].closes, 1)
    assert.equal(metrics.websockets.closed, 1)
    sockets[1].dispatchEvent(new Event('close'))
    assert.equal(shouldRestart(), false)
    advance(119_999)
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
