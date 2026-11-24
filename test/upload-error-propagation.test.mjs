import assert from 'node:assert/strict'
import { execFile } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import { fileURLToPath } from 'node:url'
import { promisify } from 'node:util'

const runFile = promisify(execFile)
const sourceRoot = new URL('../packages/agents/agents/', import.meta.url)
const fileId = '28741311-85df-4a02-9068-51dc5054ebd7'
const generatedIds = [
  'f65c4f73-c490-4fc9-a4ca-818668649714',
  'c6765c42-0756-46b2-b884-71ff3611da19',
  'bfb1f66a-a958-4b4c-98cb-66b5726c67a5'
]
const signedURL = 'https://storage.test/signed-upload'
const turn = () => new Promise(resolve => setImmediate(resolve))

function evaluate(source, name, dependencies) {
  return new Function(
    ...Object.keys(dependencies),
    `${source.replace(/^import .*\n/gm, '').replace('export default ', '')}\nreturn ${name}`
  )(...Object.values(dependencies))
}

async function drain() {
  for (let iteration = 0; iteration < 30; iteration += 1) await Promise.resolve()
}

async function rootFixture() {
  const [queueSource, agentSource] = await Promise.all([
    readFile(new URL('generic/message-queue.js', sourceRoot), 'utf8'),
    readFile(new URL('generic/index.js', sourceRoot), 'utf8')
  ])
  const connections = []
  const fetches = []
  const timers = new Map()
  let timerSequence = 0
  let uuidCalls = 0
  let putResult = { ok: true }
  class Connection {
    constructor() {
      this.messages = []
      connections.push(this)
    }
    send(message) { this.messages.push(message) }
    close() {}
  }
  const dependencies = {
    console: { log() {}, warn() {}, error: (...args) => { throw new Error(JSON.stringify(args)) } },
    setTimeout(callback, delay) {
      const timerId = ++timerSequence
      timers.set(timerId, { callback, delay })
      return timerId
    },
    clearTimeout: timerId => timers.delete(timerId),
    pkg: { version: 'upload-error-test' },
    isUUID: value => typeof value === 'string' && /^[a-f0-9-]{36}$/.test(value),
    standardJSONPatch: patch => patch,
    PatchProxy: class {},
    stateImplementation() {},
    watchImplementation: () => [() => {}, () => {}],
    downloadImplementation() {},
    sync() {}
  }
  dependencies.messageQueue = evaluate(queueSource, 'messageQueue', dependencies)
  const createAgent = evaluate(agentSource, 'Agent', dependencies)
  const agent = createAgent({
    Connection,
    domain: 'upload-errors.test',
    token: () => undefined,
    uuid: () => generatedIds[uuidCalls++],
    fetch: async (url, options) => {
      fetches.push({ url, ...options })
      return putResult
    },
    applyPatch() {},
    reboot() { throw new Error('Unexpected SDK reboot') },
    log() {}
  })
  async function authenticate(ack) {
    const connection = connections.at(-1)
    await connection.onopen()
    await connection.onmessage({ server: 'same-server', session: 'same-session', auth: { user: 'same-user' }, ack })
    await drain()
  }
  await authenticate(-1)
  const initial = connections[0].messages.find(message => message.scope === 'sessions')
  assert.ok(initial)
  await connections[0].onmessage({ si: initial.si, ii: 1 })
  await drain()
  return {
    agent, connections, fetches,
    get uuidCalls() { return uuidCalls },
    set putResult(value) { putResult = value },
    async request() {
      await drain()
      return connections.at(-1).messages.findLast(message => message.scope && message.scope !== 'sessions')
    },
    async respond(request, response) {
      await connections.at(-1).onmessage({ si: request.si, ...response })
      await drain()
    },
    async reconnect(ack) {
      const restarting = agent.reconnect()
      for (const [timerId, timer] of timers) {
        if (timer.delay !== 0) continue
        timers.delete(timerId)
        timer.callback()
      }
      await restarting
      await authenticate(ack)
    }
  }
}

async function rootProbe(scenario) {
  const fixture = await rootFixture()
  const mime = 'Text/Plain; charset="UTF-8"'
  const info = { id: fileId, type: mime, name: 'sample.txt', data: 'payload' }
  if (scenario === 'default-id') delete info.id
  if (scenario === 'url-only') delete info.data
  if (scenario === 'put-error') fixture.putResult = { ok: false, statusText: 'Storage rejected upload' }
  if (scenario === 'create-contract') {
    const id = fixture.agent.create({ active: { value: 1 } })
    assert.equal(id, generatedIds[0])
    const request = await fixture.request()
    assert.equal(request.scope, id)
    await fixture.respond(request, { ii: 1 })
    assert.deepEqual(fixture.fetches, [])
    return
  }
  const absentInfo = scenario === 'absent-info'
  const targetId = scenario === 'default-id' || absentInfo ? generatedIds[0] : fileId
  const requestId = scenario === 'default-id' || absentInfo ? generatedIds[1] : generatedIds[0]
  const uploading = fixture.agent.upload(absentInfo ? undefined : info)
  const outcome = uploading.then(value => ({ value }), error => ({ error }))
  const request = await fixture.request()
  assert.equal(request.scope, requestId)
  assert.equal(fixture.uuidCalls, scenario === 'default-id' || absentInfo ? 2 : 1)
  const expectedPatch = [
    { op: 'add', path: ['active_type'], value: 'application/json;type=upload' },
    { op: 'add', path: ['active'], value: { id: targetId, type: absentInfo ? undefined : mime, name: absentInfo ? undefined : 'sample.txt' } }
  ]
  if (!absentInfo) expectedPatch.push({ op: 'add', path: ['name'], value: 'sample.txt' })
  assert.deepEqual(request.patch, expectedPatch)
  assert.deepEqual(request.context, [])
  if (scenario === 'server-error') {
    await fixture.respond(request, { error: 'ERROR PROCESSING MESSAGE' })
    assert.deepEqual((await outcome).error, { si: request.si, error: 'ERROR PROCESSING MESSAGE' })
    assert.deepEqual(fixture.fetches, [])
    await fixture.reconnect(-1)
    assert.ok(fixture.connections.at(-1).messages.includes(request))
    await fixture.respond(request, { ii: 2, url: signedURL })
    assert.deepEqual(fixture.fetches, [])
    return
  }
  if (scenario === 'pending-replay') {
    await fixture.reconnect(-1)
    assert.ok(fixture.connections.at(-1).messages.includes(request))
  }
  await fixture.respond(request, { ii: 1, url: signedURL })
  const result = await outcome
  if (scenario === 'put-error') {
    assert.ok(result.error instanceof Error)
    assert.equal(result.error.message, 'Storage rejected upload')
  }
  else assert.equal(result.value, scenario === 'url-only' || absentInfo ? signedURL : targetId)
  const expectedFetches = scenario === 'url-only' || absentInfo ? [] : [{
    url: signedURL, method: 'PUT', headers: { 'Content-Type': mime }, body: 'payload'
  }]
  assert.deepEqual(fixture.fetches, expectedFetches)
  await fixture.reconnect(-1)
  assert.ok(fixture.connections.at(-1).messages.includes(request))
  await fixture.respond(request, { error: 'ERROR PROCESSING MESSAGE' })
  assert.deepEqual(fixture.fetches, expectedFetches)
}

async function embeddedProbe(scenario, depth) {
  const [bridgeSource, childSource] = await Promise.all([
    readFile(new URL('embed.js', sourceRoot), 'utf8'),
    readFile(new URL('generic/embedded.js', sourceRoot), 'utf8')
  ])
  const errorValues = {
    wire: { error: 'ERROR PROCESSING MESSAGE' },
    error: new Error('Signing failed'),
    string: 'Upload rejected',
    empty: '',
    undefined: undefined,
    null: null,
    false: false,
    zero: 0
  }
  const successful = scenario === 'success'
  const fetches = []
  const roots = []
  const responses = []
  let sequence = 0
  const dependencies = {
    console: { log() {}, warn() {}, error: (...args) => { throw new Error(JSON.stringify(args)) } },
    setTimeout,
    isUUID: () => false,
    validateUUID: () => false,
    isDomain: () => false,
    uuid: () => `upload-embed-${++sequence}`,
    PatchProxy: class {},
    attachSynced() {},
    watchImplementation: () => [() => {}],
    sync() {}
  }
  let agent = {
    upload: async info => {
      roots.push(info)
      if (!successful) throw errorValues[scenario]
      return signedURL
    }
  }
  for (let level = 0; level < depth; level += 1) {
    let parentListener
    let childListener
    let loadHandler
    const parent = agent
    const createChild = evaluate(childSource, 'createEmbeddedAgent', dependencies)
    agent = createChild({
      addMessageListener: listener => childListener = listener,
      postMessage: message => setImmediate(() => parentListener({ data: structuredClone(message) })),
      fetch: async (url, options) => { fetches.push({ url, ...options }); return { ok: true } },
      log() {}
    })
    const createEmbed = evaluate(bridgeSource, 'createEmbed', {
      ...dependencies,
      window: {
        location: { protocol: 'https:' },
        addEventListener: (_type, listener) => parentListener = listener
      }
    })
    createEmbed(() => parent)({ id: 'https://embedded.test/' }, {
      load() { loadHandler() },
      postMessage(message) {
        if (message.requestId) responses.push(message)
        setImmediate(() => childListener(structuredClone(message)))
      },
      setLoadHandler: handler => loadHandler = handler,
      remove() {},
      isMounted: () => true
    })
  }
  let outcome
  agent.upload({ id: fileId, type: 'text/plain', name: 'sample.txt', data: 'payload' }).then(
    value => { outcome = { value } },
    error => { outcome = { error } }
  )
  for (let iteration = 0; iteration < 50 && !outcome; iteration += 1) await turn()
  assert.ok(outcome, 'The embedded upload must settle instead of leaving the caller pending')
  assert.deepEqual(roots, [{ name: 'sample.txt', type: 'text/plain', id: fileId }])
  assert.equal(responses.length, depth)
  if (successful) {
    assert.equal(outcome.value, fileId)
    assert.deepEqual(fetches, [{ url: signedURL, method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: 'payload' }])
  }
  else {
    const error = errorValues[scenario]
    const expected = error?.message || error?.error || String(error || 'Upload request failed')
    assert.equal(outcome.error, expected)
    assert.deepEqual(fetches, [])
    for (const response of responses) assert.equal(response.error, expected)
  }
}

if (process.env.UPLOAD_ERROR_PROBE) {
  const { kind, scenario, depth } = JSON.parse(process.env.UPLOAD_ERROR_PROBE)
  if (kind === 'root') await rootProbe(scenario)
  else await embeddedProbe(scenario, depth)
  await turn()
  await turn()
  process.stdout.write('upload probe passed\n')
}
else {
  const cases = [
    ...['server-error', 'data-success', 'default-id', 'url-only', 'absent-info', 'put-error', 'pending-replay', 'create-contract']
      .map(scenario => ({ kind: 'root', scenario })),
    ...[1, 2].flatMap(depth => ['success', 'wire', 'error', 'string', 'empty', 'undefined', 'null', 'false', 'zero']
      .map(scenario => ({ kind: 'embedded', scenario, depth })))
  ]
  for (const probe of cases) {
    test(`upload error propagation: ${probe.kind} ${probe.scenario}${probe.depth ? ` at depth ${probe.depth}` : ''}`, async () => {
      const environment = { ...process.env, NODE_OPTIONS: '', UPLOAD_ERROR_PROBE: JSON.stringify(probe) }
      delete environment.NODE_TEST_CONTEXT
      const { stdout, stderr } = await runFile(process.execPath, [fileURLToPath(import.meta.url)], {
        env: environment,
        timeout: 10000
      })
      assert.equal(stdout, 'upload probe passed\n')
      assert.equal(stderr, '')
    })
  }
}
