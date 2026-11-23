import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const source = readFileSync(new URL('../packages/agents/agents/generic/message-queue.js', import.meta.url), 'utf8')
const characterization = process.env.QUEUE_AUDIT_CHARACTERIZATION === '1'
async function drain() {
  for (let iteration = 0; iteration < 20; iteration += 1) await Promise.resolve()
}

async function fixture() {
  const connections = []
  const timers = new Map()
  const reboots = []
  class Connection {
    constructor() {
      this.sent = []
      this.closeCalls = 0
      this.connected = false
      connections.push(this)
    }
    send(message) { this.sent.push(structuredClone(message)) }
    close() { this.closeCalls += 1; this.connected = false }
    async transportOpened() {
      if (this.closeCalls) return
      this.connected = true
      await this.onopen()
      await drain()
    }
    async transportLost() {
      this.connected = false
      await this.onclose('transport close')
      await drain()
    }
  }
  const dependencies = {
    console: { log() {}, warn() {}, error(...args) { throw new Error(JSON.stringify(args)) } },
    setTimeout(callback, delay) {
      const timer = {}
      timers.set(timer, { callback, delay })
      return timer
    },
    clearTimeout(timer) { timers.delete(timer) },
    pkg: { version: 'current-audit' }, isUUID: () => false, standardJSONPatch: patch => patch, structuredClone
  }
  const body = source.replace(/^import .*\n/gm, '').replace('export default ', '')
  const messageQueue = new Function(...Object.keys(dependencies), `${body}\nreturn messageQueue`)(...Object.values(dependencies))
  const [, , disconnect, reconnect] = messageQueue({
    token: () => 'anonymous', sid: () => 'stable-credential', domain: 'transport-repro.test',
    Connection, watchers: {}, states: {}, applyPatch() {}, log() {}, reboot: () => reboots.push(true)
  })
  async function authenticate(connection) {
    await connection.transportOpened()
    await connection.onmessage({ server: 'same-server', session: 'same-session', auth: { user: 'same-user' }, ack: -1 })
    await drain()
  }
  async function releaseReconnectTimer() {
    for (const [timer, entry] of timers) if (entry.delay === 0) {
      timers.delete(timer)
      entry.callback()
    }
    await drain()
  }
  await authenticate(connections[0])
  return { connections, reboots, disconnect, reconnect, authenticate, releaseReconnectTimer }
}

test('current SDK intentional reconnect closes the previous transport before replacing it', async () => {
  const harness = await fixture()
  const original = harness.connections[0]
  const reconnect = harness.reconnect()
  await harness.releaseReconnectTimer()
  await reconnect
  await harness.authenticate(harness.connections[1])
  assert.equal(original.closeCalls, 1)
  assert.equal(original.connected, false)
  assert.equal(harness.connections.filter(connection => connection.connected).length, 1)
  assert.deepEqual(harness.reboots, [])
  harness.disconnect()
  assert.equal(harness.connections.filter(connection => connection.connected).length, 0)
})

test('current SDK natural transport loss leaves its previous manager open and routes its later auth onto the replacement', { skip: !characterization }, async () => {
  const harness = await fixture()
  const original = harness.connections[0]
  await original.transportLost()
  await harness.releaseReconnectTimer()
  const replacement = harness.connections[1]
  await harness.authenticate(replacement)
  assert.equal(original.closeCalls, 0)
  const originalAuthRequests = original.sent.length
  const replacementAuthRequests = replacement.sent.length
  await original.transportOpened()
  assert.equal(original.sent.length, originalAuthRequests)
  assert.equal(replacement.sent.length, replacementAuthRequests + 1)
  assert.equal(replacement.sent.at(-1).session, 'same-session')
  assert.equal(replacement.sent.at(-1).scope, undefined)
  assert.equal(replacement.sent.at(-1).si, undefined)
  assert.equal(harness.connections.filter(connection => connection.connected).length, 2)
  assert.deepEqual(harness.reboots, [])
  harness.disconnect()
  assert.equal(replacement.closeCalls, 1)
  assert.equal(original.closeCalls, 0)
  assert.equal(original.connected, true)
})
