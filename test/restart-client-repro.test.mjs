import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { homedir } from 'node:os'
import path from 'node:path'
import test from 'node:test'
import vm from 'node:vm'

const pinnedSourcePath = path.join(
  process.env.DENO_DIR || path.join(homedir(), '.cache', 'deno'),
  'npm/registry.npmjs.org/@knowlearning/agents/0.9.186/agents/generic/message-queue.js'
)
const currentSourcePath = new URL('../packages/agents/agents/generic/message-queue.js', import.meta.url)

async function drainMicrotasks() {
  for (let iteration = 0; iteration < 20; iteration += 1) await Promise.resolve()
}

async function createHarness(sourcePath) {
  const source = await readFile(sourcePath, 'utf8')
  const connections = []
  const warnings = []
  const reboots = []
  const timers = new Map()
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
        warn: (...args) => warnings.push(args),
        error: (...args) => { throw new Error(JSON.stringify(args)) }
      },
      setTimeout: (callback, delay) => {
        timerSequence += 1
        timers.set(timerSequence, { callback, delay })
        return timerSequence
      },
      clearTimeout: timerId => timers.delete(timerId),
      pkg: { version: 'diagnostic' },
      isUUID: () => false,
      standardJSONPatch: patch => patch,
      structuredClone
    },
    { filename: String(sourcePath) }
  )

  const [queueMessage, , , reconnect] = messageQueue({
    token: () => undefined,
    domain: null,
    Connection,
    watchers: {},
    states: {},
    applyPatch() {},
    log() {},
    reboot: () => reboots.push(true)
  })

  async function authenticate(connection, session, ack) {
    await connection.onopen()
    await connection.onmessage({
      server: 'same-server',
      session,
      auth: { user: 'worker-domain' },
      ack
    })
    await drainMicrotasks()
  }

  await authenticate(connections[0], 'original-session', -1)

  return {
    connections,
    warnings,
    reboots,
    async interaction(index) {
      const completion = queueMessage({
        scope: `scope-${index}`,
        patch: [{ op: 'add', path: ['active', 'value'], value: index }],
        context: []
      })
      await drainMicrotasks()
      await connections.at(-1).onmessage({ si: index, ii: index + 100 })
      await completion
      await drainMicrotasks()
    },
    async reconnect(session, ack) {
      const completion = reconnect()
      for (const [timerId, timer] of timers) {
        if (timer.delay !== 0) continue
        timers.delete(timerId)
        timer.callback()
      }
      await completion
      await drainMicrotasks()
      await authenticate(connections.at(-1), session, ack)
    }
  }
}

test('pinned worker replays every acknowledged request when reconnect returns a new session', async () => {
  const harness = await createHarness(pinnedSourcePath)
  for (let index = 0; index < 3; index += 1) await harness.interaction(index)

  const original = harness.connections[0]
  const originalRequests = original.messages.filter(message => message.si !== undefined)
  assert.deepEqual(original.messages.filter(message => message.ack !== undefined).map(message => message.ack), [0, 1, 2])

  await harness.reconnect('replacement-session', -1)

  const replacement = harness.connections[1]
  const replayed = replacement.messages.filter(message => message.si !== undefined)
  assert.deepEqual(replayed.map(message => message.si), [0, 1, 2])
  for (let index = 0; index < replayed.length; index += 1) {
    assert.equal(replayed[index], originalRequests[index])
    await replacement.onmessage({ si: index, ii: index + 200 })
  }
  assert.equal(harness.reboots.length, 0)
  assert.equal(harness.warnings.filter(warning => warning[0].startsWith('received MULTIPLE')).length, 3)
  assert.equal(replacement.messages.filter(message => message.ack !== undefined).length, 0)
})

test('pinned worker resumes without historical replay when the session and ACK survive', async () => {
  const harness = await createHarness(pinnedSourcePath)
  for (let index = 0; index < 3; index += 1) await harness.interaction(index)
  await harness.reconnect('original-session', 2)
  assert.equal(harness.connections[1].messages.filter(message => message.si !== undefined).length, 0)
  assert.equal(harness.warnings.length, 0)
})

test('current package detects a replacement session instead of replaying the old history', async () => {
  const harness = await createHarness(currentSourcePath)
  for (let index = 0; index < 3; index += 1) await harness.interaction(index)
  await harness.reconnect('replacement-session', -1)
  assert.equal(harness.reboots.length, 1)
  assert.equal(harness.connections[1].messages.filter(message => message.si !== undefined).length, 0)
  assert.equal(harness.warnings.filter(warning => warning[0].startsWith('REBOOTING DUE TO SESSION SWITCH')).length, 1)
})

test('current package resumes without historical replay when the same session ACK survives', async () => {
  const harness = await createHarness(currentSourcePath)
  for (let index = 0; index < 3; index += 1) await harness.interaction(index)

  await harness.reconnect('original-session', 2)

  assert.equal(harness.connections[1].messages.filter(message => message.si !== undefined).length, 0)
  assert.equal(harness.reboots.length, 0)
  assert.equal(harness.warnings.length, 0)
})

test('current package replays acknowledged history when the same session ACK resets after expiry', async () => {
  const harness = await createHarness(currentSourcePath)
  for (let index = 0; index < 3; index += 1) await harness.interaction(index)
  const originalRequests = harness.connections[0].messages.filter(message => message.si !== undefined)

  await harness.reconnect('original-session', -1)

  const replacement = harness.connections[1]
  const replayed = replacement.messages.filter(message => message.si !== undefined)
  assert.deepEqual(replayed.map(message => message.si), [0, 1, 2])
  assert.equal(harness.reboots.length, 0)
  for (let index = 0; index < replayed.length; index += 1) {
    assert.equal(replayed[index], originalRequests[index])
    await replacement.onmessage({ si: index, ii: index + 200 })
  }
  assert.deepEqual(replacement.messages.filter(message => message.ack !== undefined).map(message => message.ack), [0, 1, 2])
})
