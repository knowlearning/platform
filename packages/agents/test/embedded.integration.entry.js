import { describe, it } from 'mocha'
import { expect } from 'chai'
import EmbeddedAgent from '../agents/embedded.js'

const VALID_UUID = '11111111-1111-1111-8111-111111111111'
const CHILD_UUID = '22222222-2222-1222-8222-222222222222'

const defaultEnvironment = {
  auth: { user: 'user-1' },
  context: ['context-1'],
  domain: 'example.test',
  variables: { stable: true }
}

const defaultResponses = {
  close: undefined,
  disconnect: undefined,
  download: 'https://download.example/file',
  environment: defaultEnvironment,
  interact: { ii: 7 },
  login: { ok: true },
  logout: undefined,
  metadata: { ii: 0, name: 'metadata-name', active_type: 'application/json' },
  patch: { ok: true },
  query: [{ value: 1 }],
  reconnect: undefined,
  response: { sideEffect: true },
  state: {},
  synced: undefined,
  upload: 'https://upload.example/file'
}

function clone(value) {
  if (value === undefined || value === null) return value
  return structuredClone(value)
}

function nextTick() {
  return new Promise(resolve => setTimeout(resolve, 0))
}

function createFetchResponse({ ok=true, statusText='OK' }={}) {
  return {
    ok,
    statusText,
    blob: async () => new Blob(['downloaded']),
    headers: {
      get: name => name.toLowerCase() === 'content-type' ? 'text/plain' : null
    }
  }
}

function createHarness(options={}) {
  const {
    autoRespond=true,
    autoSetup=true,
    captureConsole=false,
    fetchImplementation,
    fetchOk=true,
    fetchStatusText='Fetch failed',
    host,
    postMessageThrows=false,
    responses={}
  } = options

  const originalConsoleLog = console.log
  const listeners = []
  const sent = []
  const fetchCalls = []
  const anchors = []
  const consoleLogs = []
  const objectUrls = []
  const responseMap = { ...defaultResponses, ...responses }

  function emit(data) {
    for (const listener of listeners) listener(data)
  }

  function responseFor(message, context) {
    const value = responseMap[message.type]
    return typeof value === 'function' ? value(message, context) : clone(value)
  }

  function defaultReply(message, context) {
    return { response: responseFor(message, context) }
  }

  const context = {
    anchors,
    defaultReply,
    emit,
    fetchCalls,
    objectUrls,
    sent
  }

  if (captureConsole) {
    console.log = (...args) => consoleLogs.push(args)
  }

  const fetchRuntime = async (url, init={}) => {
    fetchCalls.push({ init, url })
    if (fetchImplementation) return fetchImplementation(url, init, context)
    return createFetchResponse({ ok: fetchOk, statusText: fetchOk ? 'OK' : fetchStatusText })
  }

  const saveDownload = async (response, name) => {
    const type = response.headers.get('Content-Type')
    const blob = new Blob([ await response.blob() ], { type })
    objectUrls.push(blob)
    const url = 'blob:download'
    const anchor = {
      appended: true,
      clicked: false,
      download: name,
      href: url,
      style: {},
      tagName: 'a',
      click() {
        anchor.clicked = true
      }
    }
    anchors.push(anchor)
    anchor.click()
    objectUrls.push({ revoked: url })
  }

  const Agent = EmbeddedAgent(
    message => {
      if (postMessageThrows) throw new Error('postMessage failed')

      sent.push(message)
      if (!autoRespond) return

      queueMicrotask(async () => {
        const result = host
          ? await host(message, context)
          : defaultReply(message, context)

        if (!result) return
        emit({
          session: 'session-1',
          requestId: message.requestId,
          ...result
        })
      })
    },
    {
      addMessageListener: listener => listeners.push(listener),
      fetch: fetchRuntime,
      saveDownload
    }
  )

  if (autoSetup) emit({ type: 'setup', session: 'session-1' })

  function restore() {
    console.log = originalConsoleLog
  }

  return {
    Agent,
    anchors,
    consoleLogs,
    emit,
    fetchCalls,
    listeners,
    objectUrls,
    restore,
    sent
  }
}

async function createBaseTraffic(Agent, sent) {
  await Agent.environment()
  await Agent.query('base-query', [])
  await Agent.patch('base-root', ['base-scope'])

  const baseState = await Agent.state('base-state')
  baseState.value = 'base'
  await nextTick()

  const baseInteract = sent.findLast(message => message.type === 'interact' && !('runId' in message))
  await Agent.response()
  const baseResponse = sent.findLast(message => message.type === 'response' && !('runId' in message))
  await Agent.synced()

  return { baseInteract, baseResponse }
}

async function createScopedTraffic(RunA, RunB, sent) {
  await RunA.environment()
  await RunA.login('provider', 'username', 'password')
  await RunA.query('scoped-query', [])
  await RunA.patch('scoped-root', ['scoped-scope'])

  const metadata = await RunA.metadata('metadata-scope')
  metadata.name = 'new-name'
  await nextTick()

  RunA.create({ id: 'created-scope', active: { ok: true } })
  await nextTick()
  await RunA.reset('reset-scope')
  await RunA.upload({ name: 'file.txt', type: 'text/plain' })
  await RunA.download('download-id').url()

  const scopedState = await RunA.state('state-scope')
  scopedState.value = 'scoped'
  await nextTick()

  const scopedInteract = sent.findLast(message => message.type === 'interact' && message.runId === 'run-a')
  await RunA.response()
  const scopedResponse = sent.findLast(message => message.type === 'response' && message.runId === 'run-a')

  await RunA.synced()
  await RunA.logout()
  await RunA.disconnect()
  await RunA.reconnect()
  await RunA.close({ reason: 'test' })
  await RunB.environment()

  return { scopedInteract, scopedResponse }
}

async function expectRejected(promise, expectedError) {
  let error
  try { await promise }
  catch (e) { error = e }
  expect(error).to.equal(expectedError)
}

describe('EmbeddedAgent integration', function () {
  let harness

  afterEach(function () {
    harness?.restore()
    harness = null
  })

  describe('host protocol', function () {
    it('waits for setup before posting requests', async function () {
      harness = createHarness({ autoSetup: false })
      const { Agent, emit, sent } = harness

      const environmentPromise = Agent.environment()
      await nextTick()
      expect(sent).to.have.length(0)

      emit({ type: 'setup', session: 'session-1' })
      const environment = await environmentPromise

      expect(environment.domain).to.equal(defaultEnvironment.domain)
      expect(sent.map(message => message.type)).to.deep.equal(['embedded-ready', 'environment'])
    })

    it('ignores responses from the wrong session', async function () {
      harness = createHarness({ autoRespond: false })
      const { Agent, emit, sent } = harness

      let resolved = false
      const queryPromise = Agent.query('wrong-session-query').then(() => {
        resolved = true
      })
      await nextTick()

      const request = sent.find(message => message.type === 'query')
      emit({ session: 'wrong-session', requestId: request.requestId, response: ['wrong'] })
      await nextTick()
      expect(resolved).to.equal(false)

      emit({ session: 'session-1', requestId: request.requestId, response: ['right'] })
      await queryPromise
      expect(resolved).to.equal(true)
    })

    it('rejects host error responses', async function () {
      harness = createHarness({
        host: (message, context) => message.type === 'query'
          ? { error: 'query failed' }
          : context.defaultReply(message, context)
      })
      const { Agent } = harness

      await expectRejected(Agent.query('failing-query'), 'query failed')
    })

    it('logs and resolves undefined when postMessage throws on fire-and-forget requests', async function () {
      harness = createHarness({ captureConsole: true, postMessageThrows: true })
      const { Agent, consoleLogs } = harness

      const result = await Agent.logout()

      expect(result).to.equal(undefined)
      expect(consoleLogs[0][0]).to.equal('ERROR POSTING MESSAGE UP')
      expect(consoleLogs[0][1]).to.deep.equal({ type: 'logout' })
      expect(consoleLogs[0][2].message).to.equal('postMessage failed')
    })
  })

  describe('base Agent compatibility', function () {
    it('keeps the base embedded Agent protocol backwards compatible', async function () {
      harness = createHarness()
      const { Agent, sent } = harness

      const { baseInteract, baseResponse } = await createBaseTraffic(Agent, sent)

      expect(sent.some(message => Object.hasOwn(message, 'runId'))).to.equal(false)
      expect(baseResponse.id).to.equal(baseInteract.requestId)
      expect(baseInteract.patch[0].path[0]).to.equal('active')
    })

    it('uses environment context as the default state scope', async function () {
      harness = createHarness()
      const { Agent, sent } = harness

      await Agent.state()

      const stateRequest = sent.find(message => message.type === 'state')
      expect(stateRequest.scope).to.equal(JSON.stringify(defaultEnvironment.context))
    })

    it('keeps the first environment variables snapshot', async function () {
      let variables = { first: true }
      harness = createHarness({
        responses: {
          environment: () => ({ ...defaultEnvironment, variables })
        }
      })
      const { Agent } = harness

      const first = await Agent.environment()
      variables = { second: true }
      const second = await Agent.environment()

      expect(first.variables).to.deep.equal({ first: true })
      expect(second.variables).to.deep.equal({ first: true })
    })

    it('exposes the sync helper unchanged', function () {
      harness = createHarness()
      const { Agent } = harness
      const state = { a: 1 }

      const result = Agent.sync(state, { a: 2, b: 3 })

      expect(state).to.deep.equal({ a: 2, b: 3 })
      expect(result.patch).to.deep.equal([
        { op: 'replace', path: '/a', value: 2 },
        { op: 'add', path: '/b', value: 3 }
      ])
    })
  })

  describe('run-scoped facades', function () {
    it('creates run-scoped Agent facades without creating a new connection listener', function () {
      harness = createHarness()
      const { Agent, listeners } = harness
      const baseKeys = Object.keys(Agent).sort()
      const listenerCountBeforeScope = listeners.length

      const RunA = Agent.withRunId('run-a')
      const RunB = RunA.withRunId('run-b')

      expect(Object.keys(RunA).sort()).to.deep.equal(baseKeys)
      expect(Object.keys(RunB).sort()).to.deep.equal(baseKeys)
      expect(listeners.length).to.equal(listenerCountBeforeScope)
    })

    it('adds runId to every outbound request made through a run-scoped facade', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const RunA = Agent.withRunId('run-a')
      const RunB = RunA.withRunId('run-b')

      const { scopedInteract, scopedResponse } = await createScopedTraffic(RunA, RunB, sent)
      const runAMessages = sent.filter(message => message.runId === 'run-a')
      const runATypes = new Set(runAMessages.map(message => message.type))

      for (const type of [
        'close',
        'disconnect',
        'download',
        'environment',
        'interact',
        'login',
        'logout',
        'metadata',
        'patch',
        'query',
        'reconnect',
        'response',
        'state',
        'synced',
        'upload'
      ]) {
        expect(runATypes.has(type), `run-a should send ${type}`).to.equal(true)
      }

      expect(scopedResponse.id).to.equal(scopedInteract.requestId)
      expect(scopedInteract.patch[0].path[0]).to.equal('active')
    })

    it('replaces the run id when withRunId is chained', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const RunA = Agent.withRunId('run-a')
      const RunB = RunA.withRunId('run-b')

      await RunB.environment()

      const runBMessages = sent.filter(message => message.runId === 'run-b')
      expect(runBMessages.some(message => message.type === 'environment')).to.equal(true)
      expect(runBMessages.every(message => message.runId === 'run-b')).to.equal(true)
      expect(sent.some(message => message.runId === 'run-a')).to.equal(false)
    })

    it('keeps response defaults isolated per facade', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const RunA = Agent.withRunId('run-a')

      await Agent.interact('base-scope', [{ op: 'add', path: ['active'], value: 'base' }])
      const baseInteract = sent.findLast(message => message.type === 'interact' && !('runId' in message))
      await RunA.interact('scoped-scope', [{ op: 'add', path: ['active'], value: 'scoped' }])
      const scopedInteract = sent.findLast(message => message.type === 'interact' && message.runId === 'run-a')

      await Agent.response()
      await RunA.response()

      const baseResponse = sent.findLast(message => message.type === 'response' && !('runId' in message))
      const scopedResponse = sent.findLast(message => message.type === 'response' && message.runId === 'run-a')
      expect(baseResponse.id).to.equal(baseInteract.requestId)
      expect(scopedResponse.id).to.equal(scopedInteract.requestId)
    })
  })

  describe('state synchronization', function () {
    it('applies external synced patches without creating echo interactions', async function () {
      harness = createHarness()
      const { Agent, emit, sent } = harness
      const callbacks = []
      const state = await Agent
        .state('sync-scope')
        .synced((syncedState, patch) => callbacks.push({ patch, state: syncedState }))

      const interactCountBefore = sent.filter(message => message.type === 'interact').length
      emit({
        session: 'session-1',
        scope: 'sync-scope',
        ii: 1,
        patch: [{ op: 'add', path: ['remote'], value: true }],
        state: { remote: true }
      })
      await nextTick()
      await nextTick()

      const interactCountAfter = sent.filter(message => message.type === 'interact').length
      expect(state.remote).to.equal(true)
      expect(callbacks).to.have.length(1)
      expect(callbacks[0].patch).to.deep.equal([{ op: 'add', path: ['remote'], value: true }])
      expect(interactCountAfter).to.equal(interactCountBefore)
    })

    it('waits for local synced state echo batches before Agent.synced resolves', async function () {
      harness = createHarness()
      const { Agent, emit } = harness
      const callbacks = []
      const state = await Agent
        .state('echo-scope')
        .synced((syncedState, patch) => callbacks.push({ patch, state: syncedState }))

      state.local = 'pending'
      await nextTick()

      let resolved = false
      const syncedPromise = Agent.synced().then(() => {
        resolved = true
      })
      await nextTick()
      expect(resolved).to.equal(false)

      emit({
        session: 'session-1',
        scope: 'echo-scope',
        ii: 7,
        patch: [{ op: 'add', path: ['local'], value: 'pending' }],
        state: { local: 'pending' }
      })
      await syncedPromise

      expect(resolved).to.equal(true)
      expect(callbacks).to.have.length(1)
      expect(callbacks[0].state).to.deep.equal({ local: 'pending' })
    })

    it('batches synchronous synced state writes into one echo callback', async function () {
      harness = createHarness()
      const { Agent, emit, sent } = harness
      const callbacks = []
      const state = await Agent
        .state('echo-batch-scope')
        .synced((syncedState, patch) => callbacks.push({ patch, state: syncedState }))

      state.a = 1
      state.b = 2
      state.c = 3
      await nextTick()

      const interactions = sent.filter(message => message.type === 'interact')
      expect(interactions).to.have.length(1)
      expect(interactions[0].patch).to.deep.equal([
        { op: 'add', path: ['active', 'a'], value: 1 },
        { op: 'add', path: ['active', 'b'], value: 2 },
        { op: 'add', path: ['active', 'c'], value: 3 }
      ])

      let resolved = false
      const syncedPromise = Agent.synced().then(() => {
        resolved = true
      })
      await nextTick()
      expect(resolved).to.equal(false)

      emit({
        session: 'session-1',
        scope: 'echo-batch-scope',
        ii: 7,
        patch: [
          { op: 'add', path: ['a'], value: 1 },
          { op: 'add', path: ['b'], value: 2 },
          { op: 'add', path: ['c'], value: 3 }
        ],
        state: { a: 1, b: 2, c: 3 }
      })
      await syncedPromise

      expect(resolved).to.equal(true)
      expect(callbacks).to.have.length(1)
      expect(callbacks[0].state).to.deep.equal({ a: 1, b: 2, c: 3 })
      expect(callbacks[0].patch).to.deep.equal([
        { op: 'add', path: ['a'], value: 1 },
        { op: 'add', path: ['b'], value: 2 },
        { op: 'add', path: ['c'], value: 3 }
      ])
    })

    it('cleans up pending synced interactions when interact rejects', async function () {
      harness = createHarness({
        host: (message, context) => message.type === 'interact'
          ? { error: 'interact rejected' }
          : context.defaultReply(message, context)
      })
      const { Agent, sent } = harness
      const state = await Agent.state('reject-scope').synced()

      state.local = 'rejected'
      await nextTick()
      await Agent.synced()

      expect(sent.some(message => message.type === 'synced')).to.equal(true)
    })
  })

  describe('watchers', function () {
    it('continues dispatching inbound watcher updates through the shared watcher registry', async function () {
      harness = createHarness()
      const { Agent, emit } = harness
      const RunA = Agent.withRunId('run-a')
      let watchCount = 0

      await new Promise(resolve => {
        RunA.watch('watched-scope', () => {
          watchCount += 1
          if (watchCount === 1) resolve()
        })
      })

      emit({
        session: 'session-1',
        scope: 'watched-scope',
        ii: 1,
        patch: [{ op: 'add', path: ['fromWatcher'], value: true }],
        state: { fromWatcher: true }
      })
      await nextTick()
      await nextTick()

      expect(watchCount).to.equal(2)
    })

    it('ignores repeated and stale updates but accepts fast-forward updates', async function () {
      harness = createHarness()
      const { Agent, emit } = harness
      const seen = []

      await new Promise(resolve => {
        Agent.watch('ordered-scope', ({ ii }) => {
          seen.push(ii)
          if (seen.length === 1) resolve()
        })
      })

      emit({ session: 'session-1', scope: 'ordered-scope', ii: 1, patch: [], state: {} })
      emit({ session: 'session-1', scope: 'ordered-scope', ii: 1, patch: [], state: {} })
      emit({ session: 'session-1', scope: 'ordered-scope', ii: 0, patch: [], state: {} })
      emit({ session: 'session-1', scope: 'ordered-scope', ii: 3, patch: [], state: {} })
      await nextTick()
      await nextTick()

      expect(seen).to.deep.equal([0, 1, 3])
    })

    it('removes watchers when unwatch is called', async function () {
      harness = createHarness()
      const { Agent, emit } = harness
      let count = 0

      const unwatch = await new Promise(resolve => {
        const stop = Agent.watch('remove-scope', () => {
          count += 1
          if (count === 1) resolve(stop)
        })
      })
      unwatch()

      emit({ session: 'session-1', scope: 'remove-scope', ii: 1, patch: [], state: {} })
      await nextTick()
      await nextTick()

      expect(count).to.equal(1)
    })

    it('dispatches UUID and user/domain-qualified watcher updates', async function () {
      harness = createHarness()
      const { Agent, emit } = harness
      let uuidCount = 0
      let qualifiedCount = 0

      await new Promise(resolve => {
        Agent.watch(VALID_UUID, () => {
          uuidCount += 1
          if (uuidCount === 1) resolve()
        })
      })

      await new Promise(resolve => {
        Agent.watch('qualified-scope', () => {
          qualifiedCount += 1
          if (qualifiedCount === 1) resolve()
        }, 'other-user', 'other.example')
      })

      emit({ session: 'session-1', scope: VALID_UUID, ii: 1, patch: [], state: {} })
      emit({
        session: 'session-1',
        scope: 'qualified-scope',
        user: 'other-user',
        domain: 'other.example',
        ii: 1,
        patch: [],
        state: {}
      })
      await nextTick()
      await nextTick()

      expect(uuidCount).to.equal(2)
      expect(qualifiedCount).to.equal(2)
    })

    it('resolves array-path deep watches through referenced UUID scopes', async function () {
      harness = createHarness({
        responses: {
          state: message => {
            if (message.scope === 'root-scope') return { child: CHILD_UUID }
            if (message.scope === CHILD_UUID) return { leaf: 'initial leaf' }
            return {}
          }
        }
      })
      const { Agent } = harness
      const values = []

      await new Promise(resolve => {
        Agent.watch(['root-scope', 'child', 'leaf'], value => {
          values.push(value)
          resolve()
        })
      })

      expect(values).to.deep.equal(['initial leaf'])
    })

    it('ignores updates with no matching watcher', async function () {
      harness = createHarness()
      const { emit } = harness

      expect(() => {
        emit({ session: 'session-1', scope: 'unknown-scope', ii: 1, patch: [], state: {} })
      }).not.to.throw()
      await nextTick()
    })
  })

  describe('metadata', function () {
    it('allows supported metadata mutations and sends them as interactions', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const metadata = await Agent.metadata('metadata-scope')

      metadata.name = 'New Name'
      metadata.active_type = 'text/plain'
      delete metadata.name
      await nextTick()

      const interactions = sent.filter(message => message.type === 'interact')
      expect(interactions).to.have.length(1)
      expect(interactions[0]).to.deep.include({ scope: 'metadata-scope' })
      expect(interactions[0].patch).to.deep.equal([
        { op: 'replace', path: ['name'], value: 'New Name' },
        { op: 'replace', path: ['active_type'], value: 'text/plain' },
        { op: 'remove', path: ['name'] }
      ])
    })

    it('throws on unsupported metadata mutations', async function () {
      harness = createHarness()
      const { Agent } = harness
      const metadata = await Agent.metadata('metadata-scope')

      expect(() => {
        metadata.description = 'not allowed'
      }).to.throw('You may only modify the type or name')

      expect(() => {
        metadata.name = 42
      }).to.throw('You may only modify the type or name')
    })
  })

  describe('uploads and downloads', function () {
    it('returns an upload URL when upload data is omitted', async function () {
      harness = createHarness()
      const { Agent, fetchCalls, sent } = harness

      const url = await Agent.upload({ id: 'upload-id', name: 'file.txt', type: 'text/plain' })

      expect(url).to.equal(defaultResponses.upload)
      expect(fetchCalls).to.have.length(0)
      expect(sent.findLast(message => message.type === 'upload').info).to.deep.equal({
        id: 'upload-id',
        name: 'file.txt',
        type: 'text/plain'
      })
    })

    it('uploads provided data with PUT and returns the file id', async function () {
      harness = createHarness()
      const { Agent, fetchCalls } = harness

      const id = await Agent.upload({
        data: 'hello',
        id: 'upload-id',
        name: 'file.txt',
        type: 'text/plain'
      })

      expect(id).to.equal('upload-id')
      expect(fetchCalls[0].url).to.equal(defaultResponses.upload)
      expect(fetchCalls[0].init).to.deep.include({
        body: 'hello',
        method: 'PUT'
      })
      expect(fetchCalls[0].init.headers).to.deep.equal({ 'Content-Type': 'text/plain' })
    })

    it('throws when upload PUT fails', async function () {
      harness = createHarness({ fetchOk: false, fetchStatusText: 'Upload failed' })
      const { Agent } = harness

      let error
      try {
        await Agent.upload({
          data: 'hello',
          id: 'upload-id',
          name: 'file.txt',
          type: 'text/plain'
        })
      }
      catch (e) {
        error = e
      }

      expect(error.message).to.equal('Upload failed')
    })

    it('supports fetch, url, and direct download modes', async function () {
      harness = createHarness()
      const { Agent, anchors, fetchCalls, sent } = harness

      const fetched = await Agent.download('download-id')
      expect(fetched.ok).to.equal(true)
      expect(fetchCalls).to.have.length(1)
      expect(fetchCalls[0].url).to.equal(defaultResponses.download)

      fetchCalls.length = 0
      const url = await Agent.download('download-id').url()
      expect(url).to.equal(defaultResponses.download)
      expect(fetchCalls).to.have.length(0)

      await Agent.download('download-id').direct()

      expect(sent.filter(message => message.type === 'download')).to.have.length(4)
      expect(sent.some(message => message.type === 'metadata')).to.equal(true)
      expect(anchors.some(anchor => (
        anchor.appended === true
        && anchor.clicked === true
        && anchor.download === defaultResponses.metadata.name
        && anchor.href === 'blob:download'
      ))).to.equal(true)
    })

    it('rejects when download fetch fails', async function () {
      harness = createHarness({ fetchOk: false, fetchStatusText: 'Download failed' })
      const { Agent } = harness

      await expectRejected(Agent.download('download-id'), 'Download failed')
    })
  })

  describe('public API message shapes', function () {
    it('sends direct interact context and query domain/context arguments', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const RunA = Agent.withRunId('run-a')

      await RunA.interact('direct-scope', [{ op: 'add', path: ['active'], value: true }], null, ['ctx-a'])
      await RunA.query('named-query', ['param-a'], 'domain.example', ['ctx-b'])

      const interact = sent.find(message => message.type === 'interact')
      const query = sent.find(message => message.type === 'query')
      expect(interact).to.deep.include({
        context: ['ctx-a'],
        runId: 'run-a',
        scope: 'direct-scope'
      })
      expect(query).to.deep.include({
        context: ['ctx-b'],
        domain: 'domain.example',
        query: 'named-query',
        runId: 'run-a'
      })
      expect(query.params).to.deep.equal(['param-a'])
    })

    it('batches synchronous same-scope interact calls', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const first = { op: 'add', path: ['active', 'a'], value: 1 }
      const second = { op: 'add', path: ['active', 'b'], value: 2 }

      const firstResponse = Agent.interact('batch-scope', [first])
      const secondResponse = Agent.interact('batch-scope', [second])
      await nextTick()

      const interactions = sent.filter(message => message.type === 'interact')
      expect(interactions).to.have.length(1)
      expect(interactions[0]).to.deep.include({ scope: 'batch-scope' })
      expect(interactions[0].patch).to.deep.equal([first, second])
      expect(await firstResponse).to.deep.equal(defaultResponses.interact)
      expect(await secondResponse).to.deep.equal(defaultResponses.interact)
    })

    it('flushes queued interactions before default response requests', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const state = await Agent.state('response-scope')

      state.ready = true
      const responsePromise = Agent.response()
      await nextTick()

      const interactIndex = sent.findIndex(message => message.type === 'interact')
      const responseIndex = sent.findIndex(message => message.type === 'response')
      const interact = sent[interactIndex]
      const response = sent[responseIndex]

      expect(interactIndex).to.be.lessThan(responseIndex)
      expect(response.id).to.equal(interact.requestId)
      await responsePromise
    })

    it('does not batch different scopes or run-scoped facades together', async function () {
      harness = createHarness()
      const { Agent, sent } = harness
      const RunA = Agent.withRunId('run-a')

      const baseResponse = Agent.interact('shared-scope', [{ op: 'add', path: ['active', 'base'], value: true }])
      const runResponse = RunA.interact('shared-scope', [{ op: 'add', path: ['active', 'run'], value: true }])
      const otherResponse = Agent.interact('other-scope', [{ op: 'add', path: ['active', 'other'], value: true }])
      await nextTick()

      const interactions = sent.filter(message => message.type === 'interact')
      const baseShared = interactions.find(message => message.scope === 'shared-scope' && !message.runId)
      const runShared = interactions.find(message => message.scope === 'shared-scope' && message.runId === 'run-a')
      const baseOther = interactions.find(message => message.scope === 'other-scope' && !message.runId)

      expect(interactions).to.have.length(3)
      expect(baseShared).to.deep.include({ scope: 'shared-scope' })
      expect(baseShared.patch).to.deep.equal([{ op: 'add', path: ['active', 'base'], value: true }])
      expect(runShared).to.deep.include({ scope: 'shared-scope', runId: 'run-a' })
      expect(runShared.patch).to.deep.equal([{ op: 'add', path: ['active', 'run'], value: true }])
      expect(baseOther).to.deep.include({ scope: 'other-scope' })
      expect(baseOther.patch).to.deep.equal([{ op: 'add', path: ['active', 'other'], value: true }])
      await Promise.all([baseResponse, runResponse, otherResponse])
    })

    it('sends create and reset patches with the expected shapes', async function () {
      harness = createHarness()
      const { Agent, sent } = harness

      const generatedId = Agent.create({ active: { generated: true } })
      Agent.create({
        active: { explicit: true },
        active_type: 'text/plain',
        id: 'explicit-id'
      })
      await Agent.reset('reset-id')
      await nextTick()

      const interactions = sent.filter(message => message.type === 'interact')
      expect(generatedId).to.be.a('string')
      expect(interactions[0].patch).to.deep.equal([
        { op: 'add', path: ['active_type'], value: 'application/json' },
        { op: 'add', path: ['active'], value: { generated: true } }
      ])
      expect(interactions[1]).to.deep.include({ scope: 'explicit-id' })
      expect(interactions[1].patch).to.deep.equal([
        { op: 'add', path: ['active_type'], value: 'text/plain' },
        { op: 'add', path: ['active'], value: { explicit: true } }
      ])
      expect(interactions[2]).to.deep.include({ scope: 'reset-id' })
      expect(interactions[2].patch).to.deep.equal([
        { op: 'add', path: ['active'], value: null }
      ])
    })

    it('sends explicit response ids when provided', async function () {
      harness = createHarness()
      const { Agent, sent } = harness

      await Agent.response('explicit-response-id')

      const response = sent.find(message => message.type === 'response')
      expect(response.id).to.equal('explicit-response-id')
    })
  })
})
