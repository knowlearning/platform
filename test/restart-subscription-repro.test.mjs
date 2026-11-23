import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import vm from 'node:vm'

const sourcePath = new URL('../packages/agents/agents/generic/message-queue.js', import.meta.url)
const scope = '00000000-0000-4000-8000-000000000001'

async function drainMicrotasks() {
  for (let iteration = 0; iteration < 20; iteration += 1) await Promise.resolve()
}

async function createHarness() {
  const source = await readFile(sourcePath, 'utf8')
  const connections = []
  const timers = new Map()
  const reboots = []
  const watcherUpdates = []
  const states = { [scope]: { active: { value: 1 }, ii: 2 } }
  let timerSequence = 0

  class Connection {
    constructor() {
      this.messages = []
      connections.push(this)
    }

    send(message) {
      this.messages.push(message)
    }

    close() {}
  }

  const messageQueue = vm.runInNewContext(
    source.replace(/^import .*\n/gm, '').replace('export default ', '') + '\nmessageQueue',
    {
      console: {
        log() {},
        warn() {},
        error: (...arguments_) => { throw new Error(JSON.stringify(arguments_)) }
      },
      setTimeout: (callback, delay) => {
        timerSequence += 1
        timers.set(timerSequence, { callback, delay })
        return timerSequence
      },
      clearTimeout: timerId => timers.delete(timerId),
      pkg: { version: 'diagnostic' },
      isUUID: value => value === scope,
      standardJSONPatch: patch => patch,
      structuredClone
    },
    { filename: String(sourcePath) }
  )

  const [queueMessage, , , reconnect] = messageQueue({
    token: () => 'anonymous',
    sid: () => 'stable-sid',
    domain: 'subscriber.test',
    Connection,
    watchers: { [scope]: [update => watcherUpdates.push(update)] },
    states,
    applyPatch(state, patch) {
      for (const operation of patch) state.active[operation.path[1]] = operation.value
    },
    log() {},
    reboot: () => reboots.push(true)
  })

  async function authenticate(connection, ack) {
    await connection.onopen()
    await connection.onmessage({
      server: 'same-server',
      session: 'same-session',
      auth: { user: 'subscriber' },
      ack
    })
    await drainMicrotasks()
  }

  await authenticate(connections[0], -1)
  const subscribed = queueMessage({
    scope: 'sessions',
    patch: [{
      op: 'add',
      path: ['active', 'same-session', 'subscriptions', 'subscription-id'],
      value: { scope }
    }],
    context: []
  })
  await drainMicrotasks()
  await connections[0].onmessage({ id: scope, si: 0, ii: 2, active: { value: 1 } })
  await subscribed

  return {
    connections,
    reboots,
    states,
    watcherUpdates,
    async reconnect(ack) {
      const completion = reconnect()
      for (const [timerId, timer] of timers) {
        if (timer.delay !== 0) continue
        timers.delete(timerId)
        timer.callback()
      }
      await completion
      await authenticate(connections.at(-1), ack)
    },
    async publication(ii, value) {
      await connections.at(-1).onmessage({
        domain: 'subscriber.test',
        user: 'owner',
        scope,
        ii,
        patch: [{ op: 'add', path: ['active', 'value'], value }]
      })
      await drainMicrotasks()
    }
  }
}

test('same-server subscription reconnect with a surviving ACK applies buffered updates', async () => {
  const harness = await createHarness()
  await harness.reconnect(0)
  const resumed = harness.connections.at(-1)

  assert.equal(resumed.messages.filter(message => message.si !== undefined).length, 0)
  await harness.publication(3, 2)

  assert.equal(harness.states[scope].active.value, 2)
  assert.equal(harness.states[scope].ii, 3)
  assert.equal(harness.watcherUpdates.length, 1)
  assert.equal(harness.reboots.length, 0)
})

test('same-session grace expiry replays subscriptions but ignores fresh snapshots and later gap updates', async () => {
  const harness = await createHarness()
  await harness.reconnect(-1)
  const resumed = harness.connections.at(-1)
  const replayed = resumed.messages.filter(message => message.si !== undefined)

  assert.equal(replayed.length, 1)
  assert.equal(replayed[0].scope, 'sessions')
  assert.equal(replayed[0].si, 0)
  await resumed.onmessage({ id: scope, si: 0, ii: 3, active: { value: 2 } })
  await drainMicrotasks()

  assert.equal(resumed.messages.filter(message => message.ack === 0).length, 1)
  assert.equal(harness.states[scope].active.value, 1)
  assert.equal(harness.states[scope].ii, 2)
  await harness.publication(4, 3)

  assert.equal(harness.states[scope].active.value, 1)
  assert.equal(harness.states[scope].ii, 2)
  assert.equal(harness.watcherUpdates.length, 0)
  assert.equal(harness.reboots.length, 0)
})
