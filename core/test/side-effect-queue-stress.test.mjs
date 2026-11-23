import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const sourceRoot = new URL('../source/', import.meta.url)
const currentSource = readFileSync(new URL('handle-connection.js', sourceRoot), 'utf8')
const workerSource = readFileSync(new URL('execute-worker-script.js', sourceRoot), 'utf8')
const originalSource = process.env.QUEUE_AUDIT_BASELINE && execFileSync('git', ['show', `${process.env.QUEUE_AUDIT_BASELINE}:core/source/handle-connection.js`], {
  cwd: new URL('../../', import.meta.url), encoding: 'utf8'
})
const variants = originalSource ? [['original', originalSource], ['patched', currentSource]] : [['patched', currentSource]]
const turn = () => new Promise(resolve => setImmediate(resolve))
const domain = 'queue-stress.test'

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

function fixture(source, context, { countScans = false } = {}) {
  const state = Object.fromEntries([
    'activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers',
    'outstandingSideEffects', 'reconnectionPromiseResolvers', 'subscriptions', 'guarantees'
  ].map(name => [name, {}]))
  const behavior = { gates: new Map(), failures: new Map(), scopeGates: new Map(), sessions: new Set(), earlyScopes: new Set(), effectDelay: 0, workerEffects: null }
  const counters = { scans: 0, started: 0, active: 0, peakActive: 0, persisted: 0, notified: 0, responses: 0 }
  const started = []
  const errors = []
  const sockets = []
  const timers = new Map()
  const queuePromise = countScans ? class extends Promise {
    static all(values) {
      counters.scans += values.length
      return super.all(values)
    }
  } : Promise
  const dependencies = {
    ...state,
    Promise: queuePromise,
    console: { log() {}, warn(...args) { errors.push(args) }, error(...args) { errors.push(args) } },
    setTimeout(callback, delay) {
      const handle = {}
      timers.set(handle, { callback, delay })
      return handle
    },
    clearTimeout(handle) { timers.delete(handle) },
    environment: { HEARTBEAT_INTERVAL: 3600000, SESSION_RECONNECTION_INTERVAL: 60000 },
    jwt: { sign: (claims, key, options, callback) => callback(null, 'stress-token') },
    SESSION: 'stress-server',
    authenticate: async message => ({ user: 'stress-user', session: message.token, provider: 'test', info: {} }),
    scopeToId: async (requestDomain, user, scope) => {
      await behavior.scopeGates.get(scope)?.promise
      return `resolved:${scope === 'alias' ? 'document' : scope}`
    },
    assertInteractionAllowed: async () => {},
    handleSideEffects: async request => {
      const { context: [label] } = request
      counters.started++
      counters.active++
      counters.peakActive = Math.max(counters.active, counters.peakActive)
      started.push(label)
      try {
        await behavior.gates.get(label)?.promise
        if (behavior.effectDelay) await new Promise(resolve => setTimeout(resolve, behavior.effectDelay))
        if (behavior.failures.has(label)) throw behavior.failures.get(label)
        if (behavior.workerEffects) return await behavior.workerEffects(request)
        return { label }
      }
      finally { counters.active-- }
    },
    interact: async (requestDomain, user, scope, patch, requestContext) => {
      if (requestContext) counters.persisted++
      return { ii: counters.persisted, active_type: 'application/json' }
    },
    coreSideEffects: async ({ send, si, ii, scope }) => {
      const response = send({ si, ii })
      if (!behavior.earlyScopes.has(scope)) return response
    },
    getState: async () => ({ active: {} }),
    subscribe: () => () => {},
    authorize: async () => true,
    handleGuarantee: async () => {},
    domainAgent: async () => ({ send(message) { if (message.type === 'mutate') counters.notified++ } })
  }
  const body = source.replace(/^import[\s\S]*?from ['"][^'"\n]+['"]\n/gm, '').replace('export default ', '')
  const handleConnection = new Function(...Object.keys(dependencies), `${body}\nreturn handleConnection`)(...Object.values(dependencies))
  context.after(async () => {
    for (const gate of behavior.gates.values()) gate.resolve()
    for (const gate of behavior.scopeGates.values()) gate.resolve()
    for (const resolve of Object.values(state.reconnectionPromiseResolvers)) resolve()
    await turn()
    for (const socket of sockets.toReversed()) await socket.onclose()
    timers.clear()
  })
  return {
    state, behavior, counters, started, errors,
    useWorkerEffects({ nestedInteraction = false, nestedInteractionError = null } = {}) {
      const workers = []
      const domainWorkers = {}, domainWorkerResponses = {}
      let workerIdentity = 0
      const workerDependencies = {
        ...dependencies,
        ENV: dependencies.environment,
        domainWorkers, domainWorkerResponses,
        uuid: () => `stress-worker-${++workerIdentity}`,
        isUUID: () => false,
        decryptString: () => '',
        configuration: async () => ({}),
        assertInteractionAllowed: async () => { if (nestedInteractionError) throw nestedInteractionError },
        isolatedWorker() {
          const worker = {
            terminated: false,
            posted: [],
            async postMessage(message) {
              this.posted.push(message)
              if (message.type === 'script' && workers.indexOf(worker) > 0) {
                await worker.onmessage({ data: { type: 'respond', id: message.id, response: message.variables } })
              }
              else if (message.type === 'script' && nestedInteraction) {
                this.runId = message.id
                await worker.onmessage({ data: {
                  type: 'interact', runId: message.id, requestId: 'nested-interaction', scope: 'document',
                  patch: [{ op: 'add', path: ['active', 'value'], value: 'nested' }]
                } })
              }
              else if (message.requestId === 'nested-interaction') {
                await worker.onmessage({ data: { type: 'respond', id: this.runId, response: message.response } })
              }
            },
            terminate() { this.terminated = true }
          }
          workers.push(worker)
          return worker
        }
      }
      if (nestedInteraction) workerDependencies.handleSideEffects = async () => ({ nested: true })
      const workerBody = workerSource
        .replace(/^import[\s\S]*?from ['"][^'"\n]+['"]\n/gm, '')
        .replace('export default ', '')
        .replaceAll('import.meta.url', JSON.stringify(new URL('execute-worker-script.js', sourceRoot).href))
      const executeWorkerScript = new Function(...Object.keys(workerDependencies), `${workerBody}\nreturn executeWorkerScript`)(...Object.values(workerDependencies))
      behavior.workerEffects = request => executeWorkerScript(false, domain, 'stress-user', 'deferred script', { label: request.context[0] }, request.session)
      return {
        workers, domainWorkers, domainWorkerResponses,
        refresh: () => executeWorkerScript(true, domain, 'stress-user', 'replacement script', { label: 'refresh' }, 'stress-refresh'),
        crash: () => workers[0].onerror({ message: 'expected worker crash' })
      }
    },
    gate(label) {
      const pending = deferred()
      behavior.gates.set(label, pending)
      return pending
    },
    async endpoint(session = 'stress-session') {
      const socket = {
        sent: [],
        send(message) {
          if (message?.si !== undefined) counters.responses++
          this.sent.push(message)
        },
        close() {}
      }
      sockets.push(socket)
      behavior.sessions.add(session)
      await handleConnection(socket, domain, 'stress-sid')
      await socket.onmessage({ domain, token: session })
      socket.sent.length = 0
      return socket
    },
    request(socket, label, si, scope = 'document') {
      return socket.onmessage({ scope, patch: [{ op: 'add', path: ['active', 'value'], value: label }], si, context: [label] })
    },
    clearMeasurements() {
      started.length = errors.length = 0
      for (const socket of sockets) socket.sent.length = 0
      for (const [handle, timer] of timers) if (timer.delay === 500) timers.delete(handle)
    },
    expireReconnections() {
      for (const [handle, timer] of timers) if (timer.delay === 60000) {
        timers.delete(handle)
        timer.callback()
      }
    }
  }
}

for (const [variant, source] of variants) {
  test(`${variant}: acknowledged history preserves responses and exposes exact queue traversal cost`, async context => {
    const harness = fixture(source, context, { countScans: true })
    const socket = await harness.endpoint()
    const count = 1200
    for (let index = 0; index < count; index++) {
      await harness.request(socket, `request-${index}`, index)
      const response = socket.sent.at(-1)
      assert.equal(response.si, index)
      assert.equal(response.ii, index + 1)
      assert.deepEqual(response.response, { label: `request-${index}` })
      await socket.onmessage({ ack: index })
      if (index % 50 === 0) harness.clearMeasurements()
    }
    assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
    assert.equal(harness.counters.persisted, count)
    assert.equal(harness.counters.notified, count)
    assert.equal(harness.counters.responses, count)
    assert.equal(harness.counters.scans, variant === 'original' ? count * (count - 1) / 2 : 0)
    const pending = harness.state.outstandingSideEffects['stress-session']
    if (variant === 'original') assert.equal(pending['resolved:document'].length, count)
    else assert.deepEqual(pending, {})
    context.diagnostic(JSON.stringify({ variant, requests: count, priorPromiseVisits: harness.counters.scans }))
  })

  test(`${variant}: blocked bursts across scopes and sessions preserve every response`, async context => {
    const harness = fixture(source, context)
    const first = await harness.endpoint('first-session')
    const second = await harness.endpoint('second-session')
    const gates = ['first-blocked', 'other-scope', 'other-session'].map(label => harness.gate(label))
    const requests = [harness.request(first, 'first-blocked', 0)]
    await turn()
    const count = 300
    for (let index = 1; index <= count; index++) requests.push(harness.request(first, `queued-${index}`, index))
    requests.push(harness.request(first, 'other-scope', count + 1, 'other-document'))
    requests.push(harness.request(second, 'other-session', 0))
    await turn()
    assert.deepEqual(harness.started, ['first-blocked', 'other-scope', 'other-session'])
    assert.equal(harness.counters.active, 3)
    for (const gate of gates) gate.resolve()
    await Promise.all(requests)
    assert.equal(harness.counters.persisted, count + 3)
    assert.equal(harness.counters.notified, count + 3)
    assert.equal(harness.counters.responses, count + 3)
    assert.deepEqual(first.sent.filter(message => message.si <= count).map(message => message.si), Array.from({ length: count + 1 }, (value, index) => index))
    await first.onmessage({ ack: first.sent.at(-1).si })
    await second.onmessage({ ack: 0 })
    assert.deepEqual(harness.state.responseBuffers['first-session'], [])
    assert.deepEqual(harness.state.responseBuffers['second-session'], [])
    if (variant === 'patched') {
      assert.deepEqual(harness.state.outstandingSideEffects['first-session'], {})
      assert.deepEqual(harness.state.outstandingSideEffects['second-session'], {})
    }
  })

  test(`${variant}: a rejected effect in a 250-request backlog preserves later results and acknowledgements`, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    const blocked = harness.gate('blocked')
    const failure = new Error('expected domain effect rejection')
    harness.behavior.failures.set('request-125', failure)
    const requests = [harness.request(socket, 'blocked', 0)]
    await turn()
    for (let index = 1; index <= 250; index++) requests.push(harness.request(socket, `request-${index}`, index))
    await turn()
    blocked.resolve()
    await Promise.all(requests)
    assert.equal(harness.counters.responses, 251)
    assert.deepEqual(socket.sent.find(message => message.si === 125).log, [failure])
    assert.equal(socket.sent.find(message => message.si === 125).error, undefined)
    assert.deepEqual(socket.sent.at(-1).response, { label: 'request-250' })
    await socket.onmessage({ ack: 250 })
    assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
    if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
  })

  test(`${variant}: reconnecting a blocked 200-request backlog retains all acknowledged operations`, async context => {
    const harness = fixture(source, context)
    const original = await harness.endpoint()
    const blocked = harness.gate('blocked')
    const requests = [harness.request(original, 'blocked', 0)]
    await turn()
    for (let index = 1; index <= 200; index++) requests.push(harness.request(original, `queued-${index}`, index))
    await turn()
    const pending = harness.state.outstandingSideEffects['stress-session']
    await original.onclose(new Error('transport lost'))
    const replacement = await harness.endpoint()
    assert.equal(harness.state.outstandingSideEffects['stress-session'], pending)
    requests.push(harness.request(replacement, 'resumed', 201))
    blocked.resolve()
    await Promise.all(requests)
    assert.equal(harness.counters.responses, 202)
    assert.equal(original.sent.length, 0)
    assert.equal(replacement.sent.length, 202)
    assert.deepEqual(replacement.sent.map(message => message.si), Array.from({ length: 202 }, (value, index) => index))
    await replacement.onmessage({ ack: 201 })
    assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
    if (variant === 'patched') assert.deepEqual(pending, {})
  })

  test(`${variant}: early-response paths release 300 queue entries without waiting for domain effects`, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    harness.behavior.earlyScopes.add('early-document')
    const count = 300
    const blocked = harness.gate('shared')
    for (let index = 0; index < count; index++) {
      harness.behavior.gates.set(`early-${index}`, blocked)
      await harness.request(socket, `early-${index}`, index, 'early-document')
    }
    assert.equal(harness.counters.active, count)
    assert.equal(harness.counters.persisted, count)
    assert.equal(harness.counters.notified, count)
    assert.equal(harness.counters.responses, 0)
    if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
    blocked.resolve()
    await turn()
    assert.equal(harness.counters.responses, count)
    assert.equal(harness.counters.active, 0)
    await socket.onmessage({ ack: count - 1 })
    assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
  })

  for (const termination of ['refresh', 'crash']) {
    test(`${variant}: worker ${termination} rejects its active script and releases the queued response`, async context => {
      const harness = fixture(source, context)
      const worker = harness.useWorkerEffects()
      const socket = await harness.endpoint()
      const running = harness.request(socket, 'running', 0)
      await turn()
      const queued = harness.request(socket, 'queued', 1)
      await turn()
      assert.equal(Object.keys(worker.domainWorkerResponses).length, 1)
      assert.deepEqual(harness.started, ['running'])
      await worker[termination]()
      await Promise.all([running, queued])
      assert.equal(worker.workers[0].terminated, true)
      assert.equal(worker.workers[0].pendingResponseIds.size, 0)
      assert.deepEqual(worker.domainWorkerResponses, {})
      assert.equal(socket.sent.find(message => message.si === 0).log.length, 1)
      assert.equal(socket.sent.find(message => message.si === 0).error, undefined)
      assert.deepEqual(socket.sent.find(message => message.si === 1).response, { label: 'queued' })
      await socket.onmessage({ ack: 1 })
      assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
      if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
    })
  }

  test(`${variant}: nested worker interactions complete their outer queue operation`, async context => {
    const harness = fixture(source, context)
    const worker = harness.useWorkerEffects({ nestedInteraction: true })
    const socket = await harness.endpoint()
    await harness.request(socket, 'outer', 0)
    assert.ok(worker.workers[0].posted.some(message => message.requestId === 'nested-interaction'))
    assert.deepEqual(worker.domainWorkerResponses, {})
    assert.deepEqual(socket.sent.find(message => message.si === 0).response.response, { nested: true })
    if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
  })

  test(`${variant}: rejected nested worker interactions leave their script and queue waiting until refresh`, { skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const harness = fixture(source, context)
    const worker = harness.useWorkerEffects({ nestedInteraction: true, nestedInteractionError: new Error('nested authorization rejected') })
    const socket = await harness.endpoint()
    let settled = 0
    const running = harness.request(socket, 'outer', 0).then(() => settled++)
    await turn()
    const queued = harness.request(socket, 'queued', 1).then(() => settled++)
    await turn()
    assert.equal(worker.workers[0].posted.some(message => message.requestId === 'nested-interaction'), false)
    assert.equal(Object.keys(worker.domainWorkerResponses).length, 1)
    assert.equal(harness.errors.filter(args => args[0] === 'ERROR executing domain worker script').length, 1)
    assert.equal(settled, 0)
    assert.deepEqual(harness.started, ['outer'])
    await worker.refresh()
    await Promise.all([running, queued])
    assert.equal(settled, 2)
    assert.deepEqual(worker.domainWorkerResponses, {})
    assert.deepEqual(socket.sent.find(message => message.si === 1).response, { label: 'queued' })
    if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
  })

  test(`${variant}: closing during unresolved scope lookup and recreating its session still admits the old lookup`, { skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const harness = fixture(source, context)
    const original = await harness.endpoint()
    const scopeGate = deferred()
    harness.behavior.scopeGates.set('document', scopeGate)
    const stale = harness.request(original, 'old-lookup', 0)
    await turn()
    await original.onclose()
    const replacement = await harness.endpoint()
    scopeGate.resolve()
    await stale
    assert.deepEqual(harness.started, ['old-lookup'])
    assert.deepEqual(replacement.sent.find(message => message.si === 0).response, { label: 'old-lookup' })
    await replacement.onmessage({ ack: 0 })
  })

  test(`${variant}: old already-started effects can still respond through a recreated session`, { skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const harness = fixture(source, context)
    const original = await harness.endpoint()
    const blocked = harness.gate('old-running')
    const running = harness.request(original, 'old-running', 0)
    await turn()
    await original.onclose()
    const replacement = await harness.endpoint()
    blocked.resolve()
    await running
    assert.deepEqual(replacement.sent.find(message => message.si === 0).response, { label: 'old-running' })
    assert.equal(original.sent.length, 0)
    await replacement.onmessage({ ack: 0 })
  })
}

test('patched: expiring a disconnected backlog discards queued mutations and frees its old tail', async context => {
  const harness = fixture(currentSource, context)
  const socket = await harness.endpoint()
  const blocked = harness.gate('blocked')
  const requests = [harness.request(socket, 'blocked', 0)]
  await turn()
  for (let index = 1; index <= 500; index++) requests.push(harness.request(socket, `queued-${index}`, index))
  await turn()
  const pending = harness.state.outstandingSideEffects['stress-session']
  await socket.onclose(new Error('transport lost'))
  harness.expireReconnections()
  await turn()
  assert.equal(harness.state.outstandingSideEffects['stress-session'], undefined)
  blocked.resolve()
  await Promise.all(requests)
  assert.deepEqual(harness.started, ['blocked'])
  assert.equal(harness.counters.persisted, 1)
  assert.deepEqual(pending, {})
})

test('patched: closing a blocked session does not settle its waiting handlers until the running effect finishes', { skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
  const harness = fixture(currentSource, context)
  const socket = await harness.endpoint()
  const blocked = harness.gate('blocked')
  let settled = 0
  const requests = [harness.request(socket, 'blocked', 0).then(() => settled++)]
  await turn()
  for (let index = 1; index <= 250; index++) requests.push(harness.request(socket, `queued-${index}`, index).then(() => settled++))
  await turn()
  await socket.onclose()
  await turn()
  assert.equal(harness.state.outstandingSideEffects['stress-session'], undefined)
  assert.equal(settled, 0)
  blocked.resolve()
  await Promise.all(requests)
  assert.equal(settled, 251)
  assert.deepEqual(harness.started, ['blocked'])
})

for (const termination of ['refresh', 'crash']) {
  test(`patched: worker ${termination} releases a closed session's entire waiting backlog`, async context => {
    const harness = fixture(currentSource, context)
    const worker = harness.useWorkerEffects()
    const socket = await harness.endpoint()
    const requests = [harness.request(socket, 'running', 0)]
    await turn()
    for (let index = 1; index <= 300; index++) requests.push(harness.request(socket, `queued-${index}`, index))
    await turn()
    const pending = harness.state.outstandingSideEffects['stress-session']
    await socket.onclose()
    assert.equal(harness.state.outstandingSideEffects['stress-session'], undefined)
    await worker[termination]()
    await Promise.all(requests)
    assert.equal(worker.workers[0].terminated, true)
    assert.equal(worker.workers[0].pendingResponseIds.size, 0)
    assert.deepEqual(worker.domainWorkerResponses, {})
    assert.deepEqual(pending, {})
    assert.deepEqual(harness.started, ['running'])
    assert.equal(harness.counters.persisted, 1)
  })
}

if (process.env.QUEUE_STRESS_BENCHMARK === '1') {
  for (const [variant, source] of variants) {
    for (const count of [2000, 4000, 8000]) {
      test(`${variant}: measured acknowledged workload of ${count} requests`, async context => {
        const harness = fixture(source, context)
        const socket = await harness.endpoint()
        globalThis.gc?.()
        const heapBefore = process.memoryUsage().heapUsed
        const cpuBefore = process.cpuUsage()
        const startedAt = performance.now()
        for (let index = 0; index < count; index++) {
          await harness.request(socket, `request-${index}`, index)
          await socket.onmessage({ ack: index })
          if (index % 100 === 0) harness.clearMeasurements()
        }
        const elapsed = performance.now() - startedAt
        const cpu = process.cpuUsage(cpuBefore)
        harness.clearMeasurements()
        await turn()
        globalThis.gc?.()
        const heapRetained = process.memoryUsage().heapUsed - heapBefore
        assert.equal(harness.counters.responses, count)
        assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
        context.diagnostic(JSON.stringify({ variant, requests: count, elapsedMs: elapsed, cpuMs: (cpu.user + cpu.system) / 1000, heapRetainedBytes: heapRetained }))
      })
    }

    test(`${variant}: measured unresolved backlog after acknowledged history`, async context => {
      const harness = fixture(source, context)
      const socket = await harness.endpoint()
      const history = 1200
      for (let index = 0; index < history; index++) {
        await harness.request(socket, `history-${index}`, index)
        await socket.onmessage({ ack: index })
        if (index % 100 === 0) harness.clearMeasurements()
      }
      harness.clearMeasurements()
      await turn()
      globalThis.gc?.()
      const heapBefore = process.memoryUsage().heapUsed
      const blocked = harness.gate('blocked')
      const requests = [harness.request(socket, 'blocked', history)]
      await turn()
      const backlog = 300
      for (let index = 1; index <= backlog; index++) requests.push(harness.request(socket, `queued-${index}`, history + index))
      await turn()
      harness.clearMeasurements()
      globalThis.gc?.()
      const heapBlocked = process.memoryUsage().heapUsed - heapBefore
      assert.equal(harness.counters.active, 1)
      blocked.resolve()
      await Promise.all(requests)
      await socket.onmessage({ ack: history + backlog })
      requests.length = 0
      harness.clearMeasurements()
      await turn()
      globalThis.gc?.()
      const heapAfterDrain = process.memoryUsage().heapUsed - heapBefore
      context.diagnostic(JSON.stringify({ variant, history, backlog, heapBlockedBytes: heapBlocked, heapAfterDrainBytes: heapAfterDrain }))
      assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
      if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects['stress-session'], {})
    })

    test(`${variant}: measured latency of a same-scope burst with slow domain effects`, async context => {
      const harness = fixture(source, context)
      const socket = await harness.endpoint()
      const blocked = harness.gate('blocked')
      const requests = [harness.request(socket, 'blocked', 0)]
      await turn()
      const count = 30
      harness.behavior.effectDelay = 10
      for (let index = 1; index <= count; index++) requests.push(harness.request(socket, `slow-${index}`, index))
      await turn()
      const startedAt = performance.now()
      blocked.resolve()
      await Promise.all(requests)
      const elapsed = performance.now() - startedAt
      assert.equal(harness.counters.responses, count + 1)
      assert.equal(harness.counters.peakActive, variant === 'original' ? count : 1)
      context.diagnostic(JSON.stringify({ variant, burstRequests: count, effectDelayMs: 10, elapsedMs: elapsed, maximumConcurrentEffects: harness.counters.peakActive }))
    })

    test(`${variant}: measured retention of a closed session with a blocked effect`, async context => {
      const harness = fixture(source, context)
      const socket = await harness.endpoint()
      harness.clearMeasurements()
      globalThis.gc?.()
      const heapBefore = process.memoryUsage().heapUsed
      const blocked = harness.gate('blocked')
      let settled = 0
      harness.request(socket, 'blocked', 0).finally(() => settled++)
      await turn()
      const count = 4000
      for (let index = 1; index <= count; index++) harness.request(socket, `queued-${index}`, index).finally(() => settled++)
      await turn()
      harness.clearMeasurements()
      globalThis.gc?.()
      const heapBlocked = process.memoryUsage().heapUsed - heapBefore
      await socket.onclose()
      await turn()
      globalThis.gc?.()
      const heapClosed = process.memoryUsage().heapUsed - heapBefore
      assert.equal(harness.state.outstandingSideEffects['stress-session'], undefined)
      assert.equal(settled, 0)
      blocked.resolve()
      await turn()
      assert.equal(settled, count + 1)
      assert.equal(harness.counters.persisted, 1)
      harness.clearMeasurements()
      await turn()
      globalThis.gc?.()
      const heapAfterDrain = process.memoryUsage().heapUsed - heapBefore
      context.diagnostic(JSON.stringify({ variant, queuedRequests: count, heapBlockedBytes: heapBlocked, heapClosedBytes: heapClosed, heapAfterDrainBytes: heapAfterDrain }))
    })
  }
}

if (process.env.QUEUE_STRESS_SOAK === '1') {
  for (const [variant, source] of variants) {
    test(`${variant}: long-lived acknowledged session keeps ordering through six reconnections`, async context => {
      const harness = fixture(source, context)
      let socket = await harness.endpoint()
      const phaseSize = 4000
      for (let phase = 0; phase < 6; phase++) {
        const startedAt = performance.now()
        for (let offset = 0; offset < phaseSize; offset++) {
          const index = phase * phaseSize + offset
          await harness.request(socket, `request-${index}`, index)
          assert.equal(socket.sent.at(-1).si, index)
          await socket.onmessage({ ack: index })
          if (offset % 100 === 0) harness.clearMeasurements()
        }
        const elapsed = performance.now() - startedAt
        harness.clearMeasurements()
        const pending = harness.state.outstandingSideEffects['stress-session']
        assert.deepEqual(harness.state.responseBuffers['stress-session'], [])
        await socket.onclose(new Error('phase transport reconnect'))
        socket = await harness.endpoint()
        assert.equal(harness.state.outstandingSideEffects['stress-session'], pending)
        if (variant === 'patched') assert.deepEqual(pending, {})
        else assert.equal(pending['resolved:document'].length, (phase + 1) * phaseSize)
        context.diagnostic(JSON.stringify({ variant, totalRequests: (phase + 1) * phaseSize, phaseElapsedMs: elapsed, retainedQueueScopes: Object.keys(pending).length }))
      }
      assert.equal(harness.counters.responses, phaseSize * 6)
      assert.equal(harness.counters.notified, phaseSize * 6)
    })
  }
}
