import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import test from 'node:test'

const root = new URL('../../', import.meta.url)
const currentSource = readFileSync(new URL('../source/handle-connection.js', import.meta.url), 'utf8')
const coreSource = readFileSync(new URL('../source/core-side-effects.js', import.meta.url), 'utf8')
const workerSource = readFileSync(new URL('../source/execute-worker-script.js', import.meta.url), 'utf8')
const effectsSource = readFileSync(new URL('../source/handle-side-effects.js', import.meta.url), 'utf8')
const persistentConnectionSource = readFileSync(new URL('../source/domain-agent/create-connection.js', import.meta.url), 'utf8')
const legacyConfigurationSource = readFileSync(new URL('../source/side-effects/configure.js', import.meta.url), 'utf8')
const domain = 'queue-audit.test'
const user = 'audit-user'
const session = 'audit-session'
const turn = () => new Promise(resolve => setImmediate(resolve))
const variants = [['patched', currentSource]]
if (process.env.QUEUE_AUDIT_BASELINE) {
  variants.unshift(['original', execFileSync('git', [
    'show', `${process.env.QUEUE_AUDIT_BASELINE}:core/source/handle-connection.js`
  ], { cwd: root, encoding: 'utf8' })])
}

function deferred() {
  let resolve
  const promise = new Promise(done => { resolve = done })
  return { promise, resolve }
}

function evaluate(source, name, dependencies) {
  const body = source.replace(/^import[\s\S]*?from ['"][^'"\n]+['"]\n/gm, '').replace('export default ', '').replace(/^export /gm, '').replaceAll('import.meta.url', 'moduleURL')
  return new Function('moduleURL', ...Object.keys(dependencies), `${body}\nreturn ${name}`)(new URL('../source/', import.meta.url).href, ...Object.values(dependencies))
}

function fixture(source, context, timerRuntime = {}) {
  const events = []
  const sockets = []
  const gates = []
  const publications = new Map()
  const mutations = []
  const effectCompletions = new Set()
  const state = Object.fromEntries([
    'activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers',
    'outstandingSideEffects', 'reconnectionPromiseResolvers', 'subscriptions', 'guarantees'
  ].map(name => [name, {}]))
  const behavior = { effects: new Map(), scopeGates: new Map(), types: new Map(), notification: null, onResponse: null, workerEffects: null, storageGate: null, agent: null }
  let interactionIndex = 0
  const dependencies = {
    ...state,
    console: { log() {}, warn() {} },
    environment: { ADMIN_DOMAIN: domain, MODE: 'local', SUPER_ADMINS: [], HEARTBEAT_INTERVAL: 3600000, SESSION_RECONNECTION_INTERVAL: 60000 },
    jwt: { sign: (claims, key, options, callback) => callback(null, 'audit-jwt') },
    SESSION: 'audit-server',
    isUUID: value => value === 'deployment-report',
    uuid: () => 'audit-uuid',
    authenticate: async () => ({ user, session, provider: 'test', info: {} }),
    scopeToId: async (requestDomain, requestUser, scope) => {
      await behavior.scopeGates.get(scope)?.promise
      return `resolved:${scope === 'delayed-alias' ? 'document' : scope}`
    },
    assertInteractionAllowed: async () => {},
    handleSideEffects: async request => {
      if (behavior.workerEffects) return behavior.workerEffects(request)
      const { context: [label] } = request
      events.push(`${label}:effects`)
      await behavior.effects.get(label)?.promise
      effectCompletions.add(label)
      return { label }
    },
    interact: async (requestDomain, requestUser, scope, patch, interactionContext) => {
      mutations.push({ domain: requestDomain, user: requestUser, scope, patch })
      if (interactionContext) events.push(`${interactionContext[0]}:persist`)
      return { ii: ++interactionIndex, active_type: behavior.types.get(scope) || 'application/json' }
    },
    getState: async () => ({ active: { value: 42 } }),
    subscribe: (id, callback) => {
      publications.set(id, callback)
      return () => publications.delete(id)
    },
    authorize: async () => true,
    handleGuarantee: async () => { events.push('guarantee:run') },
    configuredQuery: async () => ({ rows: [] }),
    applyConfiguration: async () => {},
    prepareStorageForConfiguration: async () => {
      events.push('configuration:storage')
      await behavior.storageGate?.promise
    },
    sideEffects: {},
    coreState: async () => ({}),
    coreStateSynced: async () => {},
    domainAdmin: async () => user,
    domainAgent: async () => behavior.agent || ({
      async send(message) {
        if (message.type !== 'mutate') return
        events.push(`${message.context[0]}:notify`)
        await behavior.notification?.promise
      }
    }),
    ...timerRuntime
  }
  dependencies.coreSideEffects = evaluate(coreSource, 'coreSideEffects', dependencies)
  const handleConnection = evaluate(source, 'handleConnection', dependencies)
  context.after(async () => {
    for (const gate of gates) gate.resolve()
    for (const resolve of Object.values(state.reconnectionPromiseResolvers)) resolve()
    await turn()
    for (const socket of sockets.toReversed()) await socket.onclose()
    await turn()
  })
  return {
    behavior, events, publications, state, mutations, effectCompletions,
    useLegacyConfiguration(body) {
      const stored = new Map()
      const routes = { redis: 'default', postgres: 'default' }
      const configurationDependencies = {
        ...dependencies,
        configuredDomains: {},
        parseYAML: JSON.parse,
        download: async () => 'https://storage.test/configuration',
        fetch: async () => ({ status: 200, text: () => body.promise }),
        coreState: async (requestDomain, scope) => {
          if (!stored.has(scope)) stored.set(scope, {})
          return stored.get(scope)
        },
        storageRoutesForDomain: () => routes,
        storageRoutesFromConfiguration: () => routes,
        copyDomainStateToRedisServer: async () => { events.push('legacy:storage') },
        setDomainStorageRoutes: () => {},
        stopDomainAgent: () => { events.push('legacy:stop-agent') }
      }
      behavior.types.set('legacy-configuration', 'application/json;type=domain-config')
      dependencies.sideEffects['application/json;type=domain-config'] = evaluate(legacyConfigurationSource, 'configure', configurationDependencies)
      return stored
    },
    useWorkerScript() {
      const worker = {
        async postMessage(message) {
          if (message.type === 'script') {
            this.runId = message.id
            events.push('worker:script')
            await this.onmessage({ data: {
              type: 'interact', runId: message.id, requestId: 'nested-interaction', scope: 'document',
              patch: [{ op: 'add', path: ['active', 'nested'], value: true }]
            } })
          }
          else if (message.requestId === 'nested-interaction') {
            this.nestedResponse = message.response
            await this.onmessage({ data: { type: 'synced', runId: this.runId, requestId: 'nested-synced' } })
          }
          else if (message.requestId === 'nested-synced') {
            events.push('worker:synced')
            await this.onmessage({ data: { type: 'respond', id: this.runId, response: this.nestedResponse } })
          }
        },
        terminate() {}
      }
      const workerDependencies = {
        ...dependencies,
        ENV: dependencies.environment,
        domainWorkers: {},
        domainWorkerResponses: {},
        decryptString: () => '',
        isolatedWorker: () => worker,
        configuration: async () => ({ sideEffects: { script: 'await Agent.interact(); await Agent.synced()' } })
      }
      workerDependencies.executeWorkerScript = evaluate(workerSource, 'executeWorkerScript', workerDependencies)
      behavior.workerEffects = evaluate(effectsSource, 'handleSideEffects', workerDependencies)
    },
    gate() {
      const gate = deferred()
      gates.push(gate)
      return gate
    },
    async endpoint() {
      const socket = {
        sent: [],
        send(message) {
          this.sent.push(message)
          if (message?.si !== undefined) behavior.onResponse?.(message)
        },
        close() {}
      }
      sockets.push(socket)
      await handleConnection(socket, domain, 'audit-sid')
      await socket.onmessage({ domain, token: 'audit-token' })
      return socket
    },
    request(socket, label, si, scope = 'document', patch = [{ op: 'add', path: ['active', 'value'], value: label }]) {
      return socket.onmessage({ scope, patch, si, context: [label] })
    }
  }
}

for (const [variant, source] of variants) {
  test(`${variant}: guarantee registration and deferred domain effects survive queue release`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    const delayed = harness.gate()
    harness.behavior.effects.set('guarantee', delayed)
    await harness.request(socket, 'guarantee', 0, 'sessions', [{
      op: 'add', path: ['active', session, 'guarantees', 'cleanup'],
      value: { scope: 'document', patch: [{ op: 'add', path: ['active', 'cleaned'], value: true }] }
    }])
    assert.ok(harness.state.guarantees[session].cleanup)
    assert.equal(socket.sent.some(message => message.si === 0), false)
    assert.equal(harness.effectCompletions.has('guarantee'), false)
    await harness.request(socket, 'following', 1, 'sessions')
    if (variant === 'patched') assert.deepEqual(harness.state.outstandingSideEffects[session], {})
    await socket.onclose()
    assert.equal(harness.events.filter(event => event === 'guarantee:run').length, 1)
    delayed.resolve()
    await turn()
    assert.equal(harness.effectCompletions.has('guarantee'), true)
  })

  test(`${variant}: configuration storage preparation still blocks same-scope successors`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    const storage = harness.gate()
    harness.behavior.storageGate = storage
    const deployment = harness.request(socket, 'deployment', 0, 'configuration/target.test', [{
      op: 'add', path: ['active', 'deployment'], value: 'deployment-report'
    }])
    await turn()
    assert.ok(harness.events.includes('configuration:storage'))
    const following = harness.request(socket, 'following', 1, 'configuration/target.test')
    await turn()
    assert.equal(harness.events.includes('following:effects'), false)
    assert.equal(socket.sent.some(message => message.si === 0), false)
    storage.resolve()
    await Promise.all([deployment, following])
    assert.deepEqual(socket.sent.filter(message => message.si !== undefined).map(message => message.si), [0, 1])
  })

  test(`${variant}: detached legacy configuration work survives queue release and session cleanup`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const body = harness.gate()
    const stored = harness.useLegacyConfiguration(body)
    const socket = await harness.endpoint()
    await harness.request(socket, 'deployment', 0, 'legacy-configuration', [{
      op: 'add', path: ['active'], value: { config: 'legacy-blob', report: 'legacy-report', domain: 'target.test' }
    }])
    const report = stored.get('legacy-report')
    assert.equal(typeof report.start, 'number')
    assert.equal(report.end, undefined)
    assert.ok(socket.sent.some(message => message.si === 0))
    await harness.request(socket, 'following', 1, 'legacy-configuration')
    await socket.onclose()
    body.resolve('{}')
    await turn()
    assert.equal(report.error, undefined)
    assert.equal(typeof report.end, 'number')
    assert.equal(stored.get('domain-config')['target.test'].config, 'legacy-blob')
    assert.ok(harness.events.includes('legacy:storage'))
    assert.ok(harness.events.includes('legacy:stop-agent'))
  })

  test(`${variant}: worker Agent interaction and synced dispatch bypass the waiting connection queue`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    harness.useWorkerScript()
    const socket = await harness.endpoint()
    await harness.request(socket, 'outer', 0)
    const response = socket.sent.find(message => message.si === 0)
    assert.ok(response)
    assert.equal(response.error, undefined)
    assert.deepEqual(harness.events.filter(event => event.startsWith('worker:')), ['worker:script', 'worker:synced'])
    assert.equal(harness.mutations.filter(mutation => mutation.user === user && mutation.scope === 'document').length, 1)
    assert.equal(harness.mutations.filter(mutation => mutation.user === domain && mutation.scope === 'document').length, 1)
  })

  test(`${variant}: a response can enqueue another mutation without overtaking its notification`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    let following
    harness.behavior.onResponse = message => {
      if (message.si === 0) following = harness.request(socket, 'following', 1)
    }
    await harness.request(socket, 'first', 0)
    await following
    assert.deepEqual(harness.events, [
      'first:effects', 'first:persist', 'first:notify',
      'following:effects', 'following:persist', 'following:notify'
    ])
    assert.deepEqual(socket.sent.filter(message => message.si !== undefined).map(message => message.si), [0, 1])
  })

  test(`${variant}: domain-agent notification promises do not block subsequent mutations`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    harness.behavior.notification = harness.gate()
    await harness.request(socket, 'first', 0)
    await harness.request(socket, 'following', 1)
    assert.deepEqual(harness.events.filter(event => event.endsWith(':notify')), ['first:notify', 'following:notify'])
    assert.ok(socket.sent.some(message => message.si === 1))
  })

  test(`${variant}: queued mutations retain a replaced persistent agent but still complete`, { timeout: 2000, skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const harness = fixture(source, context)
    const createConnection = evaluate(persistentConnectionSource, 'createConnection', { console: { warn() {} } })
    const agents = {}
    const originalWorker = { messages: [], postMessage(message) { this.messages.push(message) }, terminate() {} }
    const replacementWorker = { messages: [], postMessage(message) { this.messages.push(message) }, terminate() {} }
    const originalAgent = createConnection(originalWorker, 'old-agent', domain, agents, 1)
    const replacementAgent = createConnection(replacementWorker, 'new-agent', domain, agents, 2)
    await originalAgent.send({ server: 'audit-server' })
    await replacementAgent.send({ server: 'audit-server' })
    harness.behavior.agent = originalAgent
    const socket = await harness.endpoint()
    const effect = harness.gate()
    harness.behavior.effects.set('running', effect)
    const running = harness.request(socket, 'running', 0)
    await turn()
    const queued = harness.request(socket, 'queued', 1)
    await turn()
    assert.equal(harness.events.includes('queued:effects'), false)
    originalAgent.close()
    harness.behavior.agent = replacementAgent
    effect.resolve()
    await Promise.all([running, queued])
    assert.deepEqual(socket.sent.filter(message => message.si !== undefined).map(message => message.si), [0, 1])
    assert.ok(harness.effectCompletions.has('queued'))
    assert.equal(originalWorker.messages.some(message => message.type === 'mutate'), false)
    assert.equal(replacementWorker.messages.some(message => message.type === 'mutate'), false)
    await harness.request(socket, 'fresh', 2)
    assert.deepEqual(replacementWorker.messages.filter(message => message.type === 'mutate').map(message => message.context[0]), ['fresh'])
  })

  test(`${variant}: retained subscription callbacks route updates through a resumed connection`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const original = await harness.endpoint()
    await harness.request(original, 'watch', 0, 'sessions', [{
      op: 'add', path: ['active', session, 'subscriptions', 'watch'], value: { scope: 'document' }
    }])
    await turn()
    await original.onmessage({ ack: 0 })
    const callback = harness.publications.get('resolved:document')
    const subscriptions = harness.state.subscriptions[session]
    await original.onclose(new Error('transport disconnected'))
    const resumed = await harness.endpoint()
    assert.equal(harness.state.subscriptions[session], subscriptions)
    assert.equal(harness.publications.get('resolved:document'), callback)
    await callback({ ii: 73, scope: 'document', patch: [{ op: 'add', path: ['active', 'value'], value: 73 }] })
    assert.equal(original.sent.some(message => message.ii === 73), false)
    assert.deepEqual(resumed.sent.find(message => message.ii === 73).response, { label: 'watch' })
  })

  test(`${variant}: retained subscription sends rearm the original socket heartbeat`, { timeout: 2000, skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const timers = new Map()
    let timerId = 0
    const harness = fixture(source, context, {
      setTimeout(callback, delay) {
        const identifier = ++timerId
        timers.set(identifier, { callback, delay })
        return identifier
      },
      clearTimeout(identifier) { timers.delete(identifier) }
    })
    const heartbeatTimers = () => [...timers.entries()].filter(([, timer]) => timer.delay === 3600000)
    const original = await harness.endpoint()
    await harness.request(original, 'watch', 0, 'sessions', [{
      op: 'add', path: ['active', session, 'subscriptions', 'watch'], value: { scope: 'document' }
    }])
    await turn()
    await original.onmessage({ ack: 0 })
    await original.onclose(new Error('transport disconnected'))
    const resumed = await harness.endpoint()
    await harness.publications.get('resolved:document')({ ii: 73, scope: 'document', patch: [] })
    assert.equal(heartbeatTimers().length, 2)
    await resumed.onclose()
    assert.equal(harness.state.activeConnections[session], undefined)
    assert.equal(harness.state.responseBuffers[session], undefined)
    assert.equal(heartbeatTimers().length, 1)
    const [identifier, orphan] = heartbeatTimers()[0]
    timers.delete(identifier)
    const originalSends = original.sent.length
    orphan.callback()
    assert.equal(original.sent.length, originalSends + 1)
    assert.equal(original.sent.at(-1), undefined)
    assert.equal(heartbeatTimers().length, 1)
  })

  test(`${variant}: scope resolution completion determines queue admission order`, { timeout: 2000, skip: process.env.QUEUE_AUDIT_CHARACTERIZATION !== '1' }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    const lookup = harness.gate()
    harness.behavior.scopeGates.set('delayed-alias', lookup)
    const delayed = harness.request(socket, 'earlier', 0, 'delayed-alias')
    await harness.request(socket, 'later', 1)
    lookup.resolve()
    await delayed
    assert.deepEqual(harness.events.filter(event => event.endsWith(':effects')), ['later:effects', 'earlier:effects'])
    assert.deepEqual(socket.sent.filter(message => message.si !== undefined).map(message => message.si), [1, 0])
  })

  test(`${variant}: cleanup during scope resolution prevents the unresolved request from starting`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const socket = await harness.endpoint()
    const lookup = harness.gate()
    harness.behavior.scopeGates.set('document', lookup)
    const request = harness.request(socket, 'unresolved', 0)
    await turn()
    await socket.onclose()
    lookup.resolve()
    await request
    assert.deepEqual(harness.events, [])
    assert.equal(harness.state.outstandingSideEffects[session], undefined)
  })

  test(`${variant}: session recreation ${variant === 'patched' ? 'rejects' : 'admits'} stale queued work`, { timeout: 2000 }, async context => {
    const harness = fixture(source, context)
    const original = await harness.endpoint()
    const runningGate = harness.gate()
    const replacementGate = harness.gate()
    harness.behavior.effects.set('running', runningGate)
    harness.behavior.effects.set('replacement', replacementGate)
    const running = harness.request(original, 'running', 0)
    await turn()
    const stale = harness.request(original, 'stale', 1)
    await turn()
    await original.onclose()
    const replacement = await harness.endpoint()
    const current = harness.request(replacement, 'replacement', 0)
    await turn()
    runningGate.resolve()
    await Promise.all([running, stale])
    assert.equal(harness.events.includes('stale:effects'), variant === 'original')
    replacementGate.resolve()
    await current
  })
}
