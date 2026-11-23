import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sourceRoot = new URL('../', import.meta.url)
const clientSource = readFileSync(new URL('packages/agents/agents/generic/message-queue.js', sourceRoot), 'utf8')
const currentServer = readFileSync(new URL('core/source/handle-connection.js', sourceRoot), 'utf8')
const baselineServer = process.env.QUEUE_AUDIT_BASELINE && execFileSync('git', [
  'show', `${process.env.QUEUE_AUDIT_BASELINE}:core/source/handle-connection.js`
], { cwd: sourceRoot, encoding: 'utf8' })
const variants = baselineServer ? [['baseline', baselineServer], ['current', currentServer]] : [['current', currentServer]]
const characterization = process.env.QUEUE_AUDIT_CHARACTERIZATION === '1'
const turn = () => new Promise(resolve => setImmediate(resolve))

function evaluate(source, exportedName, dependencies) {
  const body = source.replace(/^import[\s\S]*?from ['"][^'"\n]+['"](?: assert \{[^\n]+\})?\n/gm, '').replace('export default ', '')
  return new Function(...Object.keys(dependencies), `${body}\nreturn ${exportedName}`)(...Object.values(dependencies))
}

async function fixture(serverSource, context) {
  const state = Object.fromEntries([
    'activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers',
    'outstandingSideEffects', 'reconnectionPromiseResolvers', 'subscriptions', 'guarantees'
  ].map(name => [name, {}]))
  const documents = new Map()
  const timers = new Map()
  const pending = new Set()
  const errors = []
  const reboots = []
  const connections = []
  const serverSockets = []
  const domain = 'restart-grace.test'
  const session = 'original-persisted-session'
  const timerDependencies = {
    setTimeout(callback, delay) {
      const handle = {}
      timers.set(handle, { callback, delay })
      return handle
    },
    clearTimeout(handle) { timers.delete(handle) }
  }
  const output = { log() {}, warn() {}, error(...args) { errors.push(new Error(JSON.stringify(args))) } }
  function track(operation) {
    const result = Promise.resolve(operation)
    pending.add(result)
    result.then(() => pending.delete(result), error => { pending.delete(result); errors.push(error) })
    return result
  }
  async function drain() {
    for (let iteration = 0; iteration < 100; iteration += 1) {
      await turn()
      if (!pending.size) {
        assert.deepEqual(errors, [])
        return
      }
    }
    assert.fail('Connection fixture did not drain')
  }
  function runTimers(delay) {
    for (const [handle, timer] of timers) if (timer.delay === delay) {
      timers.delete(handle)
      timer.callback()
    }
  }
  const handleConnection = evaluate(serverSource, 'handleConnection', {
    ...state, ...timerDependencies, console: output,
    environment: { HEARTBEAT_INTERVAL: 3600000, SESSION_RECONNECTION_INTERVAL: 60000 },
    SESSION: 'same-live-server',
    jwt: { sign: (claims, key, options, callback) => callback(null, 'fixture-jwt') },
    authenticate: async message => ({ user: 'same-owner', session: message.session || (message.token === 'independent' ? 'independent-session' : session), provider: 'fixture', info: {} }),
    scopeToId: async (requestDomain, user, scope) => scope,
    assertInteractionAllowed: async () => {},
    handleSideEffects: async () => {},
    async interact(requestDomain, user, scope, patch) {
      if (scope === 'sessions') return { ii: 0, active_type: 'application/json' }
      const document = documents.get(scope) || { ii: 0, active: {} }
      for (const operation of patch) {
        assert.equal(operation.op, 'add')
        assert.deepEqual(operation.path, ['active', 'value'])
        document.active.value = operation.value
      }
      document.ii += 1
      documents.set(scope, document)
      return { ii: document.ii, active_type: 'application/json' }
    },
    coreSideEffects: async ({ send, si, ii }) => send({ si, ii }),
    getState: async () => ({ active: {} }),
    subscribe: () => () => {}, authorize: async () => true,
    handleGuarantee: async () => {}, domainAgent: async () => null
  })
  class Connection {
    constructor() {
      this.sent = []
      this.received = []
      this.dropResponses = new Set()
      const socket = this.socket = {
        send: message => {
          this.received.push(structuredClone(message))
          if (!this.dropResponses.has(message?.si)) track(this.onmessage?.(structuredClone(message)))
        },
        close() {}
      }
      serverSockets.push(socket)
      connections.push(this)
      track(handleConnection(socket, domain, 'stable-credential').then(() => this.onopen()))
    }
    send(message) {
      this.sent.push(structuredClone(message))
      track(this.socket.onmessage(structuredClone(message)))
    }
    close() { track(this.socket.onclose(new Error('simulated transport loss'))) }
  }
  const messageQueue = evaluate(clientSource, 'messageQueue', {
    ...timerDependencies, console: output, pkg: { version: 'current-audit' },
    isUUID: () => false, standardJSONPatch: patch => patch, structuredClone
  })
  const [queueMessage, , disconnect, reconnect] = messageQueue({
    token: () => 'anonymous', sid: () => 'stable-credential', domain, Connection,
    watchers: {}, states: {}, applyPatch() {}, log() {}, reboot: () => reboots.push(true)
  })
  const patch = value => [{ op: 'add', path: ['active', 'value'], value }]
  const independent = { sent: [], send(message) { this.sent.push(structuredClone(message)) }, close() {} }
  serverSockets.push(independent)
  await handleConnection(independent, domain, 'stable-credential')
  await independent.onmessage({ token: 'independent' })
  let independentIndex = 0
  await drain()
  context.after(async () => {
    disconnect()
    await drain()
    for (const socket of serverSockets) await socket.onclose()
    for (const resolve of Object.values(state.reconnectionPromiseResolvers)) resolve()
    timers.clear()
  })
  return {
    state, documents, connections, reboots, session, drain,
    request: (value, scope = 'document') => queueMessage({ scope, patch: patch(value), context: [] }),
    async independentWrite(value) {
      const index = independentIndex++
      await independent.onmessage({ scope: 'document', patch: patch(value), si: index, context: [] })
      await independent.onmessage({ ack: index })
    },
    async disconnect(expire = false) {
      disconnect()
      await drain()
      assert.equal(typeof state.reconnectionPromiseResolvers[session], 'function')
      if (expire) {
        runTimers(60000)
        await drain()
        assert.equal(state.sessionMessageIndexes[session], undefined)
        assert.equal(state.responseBuffers[session], undefined)
      }
    },
    async reconnect() {
      const completion = reconnect()
      runTimers(0)
      await completion
      await drain()
      const first = connections[0].received.find(message => message?.auth)
      const latest = connections.at(-1).received.find(message => message?.auth)
      assert.equal(latest.server, first.server)
      assert.equal(latest.session, first.session)
      assert.equal(latest.auth.user, first.auth.user)
      assert.deepEqual(reboots, [])
      return latest
    }
  }
}

for (const [variant, source] of variants) {
  test(`${variant}: current SDK surviving session acknowledgement preserves a newer independent write`, async context => {
    const harness = await fixture(source, context)
    for (const value of [0, 1, 2]) await harness.request(value)
    await harness.drain()
    assert.deepEqual(harness.state.responseBuffers[harness.session], [])
    await harness.disconnect()
    await harness.independentWrite(100)
    const auth = await harness.reconnect()
    assert.equal(auth.ack, 2)
    assert.deepEqual(harness.documents.get('document'), { ii: 4, active: { value: 100 } })
    assert.equal(harness.connections.at(-1).sent.filter(message => message.si !== undefined).length, 0)
  })

  test(`${variant}: current SDK expired same-session acknowledgement replays stale writes over a newer independent write`, { skip: !characterization }, async context => {
    const harness = await fixture(source, context)
    for (const value of [0, 1, 2]) await harness.request(value)
    await harness.drain()
    await harness.disconnect(true)
    await harness.independentWrite(200)
    assert.deepEqual(harness.documents.get('document'), { ii: 4, active: { value: 200 } })
    const auth = await harness.reconnect()
    assert.equal(auth.ack, -1)
    assert.deepEqual(harness.connections.at(-1).sent.filter(message => message.si !== undefined).map(message => message.si), [0, 1, 2])
    assert.deepEqual(harness.documents.get('document'), { ii: 7, active: { value: 2 } })
    assert.deepEqual(harness.state.responseBuffers[harness.session], [])
  })

  test(`${variant}: expiry still recovers an unconfirmed lower sequence after a higher sequence was confirmed`, async context => {
    const harness = await fixture(source, context)
    harness.connections[0].dropResponses.add(0)
    let firstResolved = false
    const first = harness.request(10, 'first-scope').then(response => { firstResolved = true; return response })
    await harness.drain()
    await harness.request(20, 'second-scope')
    await harness.drain()
    assert.equal(firstResolved, false)
    assert.equal(harness.state.sessionMessageIndexes[harness.session], 1)
    await harness.disconnect(true)
    const auth = await harness.reconnect()
    assert.equal(auth.ack, -1)
    await first
    assert.equal(firstResolved, true)
    assert.equal(harness.documents.get('first-scope').active.value, 10)
    assert.equal(harness.documents.get('second-scope').active.value, 20)
  })
}
