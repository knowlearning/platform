import test, { beforeEach, afterEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'

const fixtureName = Symbol.for('knowlearning.side-effect-queue-test')
const domain = 'queue.test', user = 'queue-user', session = 'queue-session'
const events = [], sockets = []
const behaviors = new Map(), milestones = new Map()
const unawaitedSends = new Set()
let interactionIndex

function deferred() {
  let resolve, reject
  const promise = new Promise((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

const turn = () => new Promise(resolve => setImmediate(resolve))
async function waitFor(promise) {
  let timer
  try {
    return await Promise.race([
      promise,
      new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Queue milestone was not reached')), 1000) })
    ])
  }
  finally { clearTimeout(timer) }
}

function milestone(label, stage) {
  const key = `${label}:${stage}`
  if (!milestones.has(key)) milestones.set(key, deferred())
  return milestones.get(key)
}

function runStage(stage, patch) {
  const label = patch[0].value
  events.push(`${label}:${stage}`)
  milestone(label, stage).resolve()
  const behavior = behaviors.get(`${label}:${stage}`)
  if (behavior instanceof Error) throw behavior
  return behavior?.promise
}

function gate(label, stage = 'effects') {
  const pending = deferred()
  behaviors.set(`${label}:${stage}`, pending)
  return pending
}

const agent = { send(message) { if (message.type === 'mutate') runStage('notify', message.data.patch) } }
globalThis[fixtureName] = {
  environment: { HEARTBEAT_INTERVAL: 3600000, SESSION_RECONNECTION_INTERVAL: 100 },
  jwt: { sign: (claims, key, options, callback) => callback(null, 'queue-jwt') },
  authenticate: async message => ({ user, session: message.token, provider: 'test', info: {} }),
  scopeToId: async (requestDomain, requestUser, scope) => `resolved:${scope === 'document-alias' ? 'document' : scope}`,
  getState: async () => ({ active: {} }),
  assertInteractionAllowed: (requestDomain, requestUser, id, patch) => Promise.resolve(runStage('preflight', patch)),
  handleSideEffects: ({ patch }) => Promise.resolve(runStage('effects', patch)).then(() => ({ worked: true })),
  interact(requestDomain, requestUser, scope, patch) {
    if (patch[0].path[2] === 'close') {
      milestone(patch[0].path[1], 'closed').resolve()
      return Promise.resolve({})
    }
    return Promise.resolve(runStage('persistence', patch)).then(() => ({ ii: ++interactionIndex, active_type: 'application/json' }))
  },
  coreSideEffects: ({ patch, send, si, ii }) => Promise.resolve(runStage('core', patch)).then(() => {
    const response = send({ si, ii })
    if (!unawaitedSends.has(patch[0].value)) return response
  }),
  domainAgent: async () => agent
}

const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map()
const stub = names => `const fixture = globalThis[Symbol.for('knowlearning.side-effect-queue-test')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const mockDefault = (path, name) => mock(path, `${stub([name])}\nexport default ${name};`)
mock('utils.js', stub(['environment', 'jwt']))
mock('persistence.js', stub(['getState']))
mock('interact.js', `${stub(['interact', 'assertInteractionAllowed'])}\nexport default interact;`)
for (const [path, name] of [
  ['authenticate/index.js', 'authenticate'], ['scope-to-id.js', 'scopeToId'],
  ['handle-side-effects.js', 'handleSideEffects'], ['core-side-effects.js', 'coreSideEffects'],
  ['domain-agent/index.js', 'domainAgent']
]) mockDefault(path, name)
mock('session.js', 'export default "queue-server"')
mock('subscribe.js', 'export default () => () => {}')
mock('authorize.js', 'export default async () => true')
mock('handle-guarantee.js', 'export default async () => {}')
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url) ? { format: 'module', source: mocks.get(url), shortCircuit: true } : nextLoad(url, context)
  }
})
const { default: handleConnection } = await import('../source/handle-connection.js')
const stateful = await import('../source/stateful.js')
hooks.deregister()

beforeEach(() => {
  events.length = sockets.length = interactionIndex = 0
  behaviors.clear()
  milestones.clear()
  unawaitedSends.clear()
  for (const name of ['activeConnections', 'activeConnectionInfo', 'sessionMessageIndexes', 'responseBuffers', 'outstandingSideEffects', 'reconnectionPromiseResolvers', 'subscriptions']) {
    for (const key of Object.keys(stateful[name])) delete stateful[name][key]
  }
})
afterEach(async () => {
  for (const behavior of behaviors.values()) behavior.resolve?.()
  for (const resolve of Object.values(stateful.reconnectionPromiseResolvers)) resolve()
  await turn()
  for (const socket of sockets.toReversed()) await socket.onclose()
  await turn()
})
after(() => { delete globalThis[fixtureName] })

async function endpoint(targetSession = session) {
  const socket = { sent: [], send(message) { this.sent.push(message) }, close() {} }
  sockets.push(socket)
  await handleConnection(socket, domain, 'queue-sid')
  await socket.onmessage({ domain, token: targetSession })
  assert.equal(socket.sent[0].session, targetSession)
  let messageIndex = stateful.sessionMessageIndexes[targetSession] + 1
  return {
    socket,
    request(label, scope = 'document', path = ['active', 'value']) {
      return socket.onmessage({ scope, patch: [{ op: 'add', path, value: label }], context: [], si: messageIndex++ })
    }
  }
}

const startedEffects = () => events.filter(event => event.endsWith(':effects'))

test('same-scope requests start one at a time and retain only the newest tail', async () => {
  const client = await endpoint()
  const firstGate = gate('first'), secondGate = gate('second'), thirdGate = gate('third')
  const first = client.request('first')
  await waitFor(milestone('first', 'effects').promise)
  const second = client.request('second'), third = client.request('third')
  await turn()
  const queues = stateful.outstandingSideEffects[session]
  const newestTail = queues['resolved:document']
  assert.equal(typeof newestTail.then, 'function')
  assert.deepEqual(startedEffects(), ['first:effects'])

  firstGate.resolve()
  await waitFor(milestone('second', 'effects').promise)
  await turn()
  assert.deepEqual(startedEffects(), ['first:effects', 'second:effects'])
  assert.equal(queues['resolved:document'], newestTail)

  secondGate.resolve()
  await waitFor(milestone('third', 'effects').promise)
  assert.equal(queues['resolved:document'], newestTail)
  thirdGate.resolve()
  await waitFor(Promise.all([first, second, third]))
  await turn()
  assert.deepEqual(Object.keys(queues), [])
})

test('a simultaneous burst into an empty queue starts only one operation', async () => {
  const client = await endpoint()
  const blocked = gate('request-0')
  const requests = Array.from({ length: 40 }, (value, index) => client.request(`request-${index}`))
  await waitFor(milestone('request-0', 'effects').promise)
  await turn()
  assert.deepEqual(startedEffects(), ['request-0:effects'])
  blocked.resolve()
  await waitFor(Promise.all(requests))
  assert.deepEqual(startedEffects(), requests.map((value, index) => `request-${index}:effects`))
  await turn()
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

test('different scopes and sessions proceed independently', async () => {
  const firstClient = await endpoint(), secondClient = await endpoint('another-session')
  const blocked = ['first', 'other-scope', 'other-session'].map(label => gate(label))
  const requests = [firstClient.request('first'), firstClient.request('other-scope', 'another-document'), secondClient.request('other-session')]
  await waitFor(Promise.all(['first', 'other-scope', 'other-session'].map(label => milestone(label, 'effects').promise)))
  assert.equal(startedEffects().length, 3)
  for (const pending of blocked) pending.resolve()
  await waitFor(Promise.all(requests))
  await turn()
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  assert.deepEqual(stateful.outstandingSideEffects['another-session'], {})
})

test('aliases resolving to the same scope share a queue', async () => {
  const client = await endpoint()
  const blocked = gate('first')
  const first = client.request('first')
  await waitFor(milestone('first', 'effects').promise)
  const second = client.request('alias', 'document-alias')
  await turn()
  assert.deepEqual(startedEffects(), ['first:effects'])
  blocked.resolve()
  await waitFor(Promise.all([first, second]))
  assert.deepEqual(startedEffects(), ['first:effects', 'alias:effects'])
})

for (const stage of ['preflight', 'persistence', 'core']) {
  test(`the next request waits for pending ${stage} work`, async () => {
    const client = await endpoint()
    const blocked = gate('first', stage)
    const first = client.request('first')
    await waitFor(milestone('first', stage).promise)
    const second = client.request('second')
    await turn()
    assert.equal(events.includes('second:preflight'), false)
    blocked.resolve()
    await waitFor(Promise.all([first, second]))
    await turn()
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

test('completed requests leave no queue history across many scopes', async () => {
  const client = await endpoint()
  for (let index = 0; index < 1000; index += 1) {
    await client.request(`request-${index}`, `document-${index % 20}`)
    await client.socket.onmessage({ ack: index })
  }
  await turn()
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  assert.deepEqual(stateful.responseBuffers[session], [])
})

for (const keepalive of [false, true]) {
  test(`${keepalive ? 'keepalive' : 'transport'} reconnection preserves pending and queued work`, async () => {
    const original = await endpoint()
    const blocked = gate('first')
    const first = original.request('first')
    await waitFor(milestone('first', 'effects').promise)
    const queued = original.request('queued')
    await turn()
    const queues = stateful.outstandingSideEffects[session]
    if (keepalive) await original.socket.onmessage({ type: 'close', info: { keepalive: true } })
    await original.socket.onclose(new Error('transport disconnected'))
    const resumed = await endpoint()
    const following = resumed.request('resumed')
    await turn()
    assert.equal(stateful.outstandingSideEffects[session], queues)
    assert.deepEqual(startedEffects(), ['first:effects'])
    blocked.resolve()
    await waitFor(Promise.all([first, queued, following]))
    await turn()
    assert.deepEqual(startedEffects(), ['first:effects', 'queued:effects', 'resumed:effects'])
    assert.deepEqual(queues, {})
  })
}

test('queued work can finish during the reconnect grace period', async () => {
  const original = await endpoint()
  const blocked = gate('first')
  const first = original.request('first')
  await waitFor(milestone('first', 'effects').promise)
  const queued = original.request('queued')
  await turn()
  await original.socket.onclose(new Error('transport disconnected'))
  blocked.resolve()
  await waitFor(Promise.all([first, queued]))
  assert.deepEqual(startedEffects(), ['first:effects', 'queued:effects'])
  assert.equal(interactionIndex, 2)
  const resumed = await endpoint()
  assert.deepEqual(resumed.socket.sent.filter(message => message.ii).map(message => message.si), [0, 1])
})

for (const closeType of ['clean', 'explicit', 'expired']) {
  test(`${closeType} session closure cancels queued requests before preflight`, async () => {
    const client = await endpoint()
    const blocked = gate('running')
    const running = client.request('running')
    await waitFor(milestone('running', 'effects').promise)
    const queued = [client.request('queued-first'), client.request('queued-second')]
    const settled = Promise.allSettled([running, ...queued])
    await turn()
    const queues = stateful.outstandingSideEffects[session]
    if (closeType === 'explicit') await client.socket.onmessage({ type: 'close' })
    else await client.socket.onclose(closeType === 'expired' ? new Error('transport disconnected') : undefined)
    await waitFor(milestone(session, 'closed').promise)
    assert.equal(stateful.outstandingSideEffects[session], undefined)

    blocked.resolve()
    const results = await waitFor(settled)
    assert.deepEqual(events.filter(event => event.startsWith('queued-')), [])
    assert.ok(results.slice(1).every(result => result.status === 'fulfilled'))
    assert.equal(interactionIndex, 1)
    assert.deepEqual(queues, {})
  })
}

for (const stage of ['preflight', 'persistence']) {
  test(`session closure does not cancel an operation already awaiting ${stage}`, async () => {
    const client = await endpoint()
    const blocked = gate('running', stage)
    const running = client.request('running')
    await waitFor(milestone('running', stage).promise)
    const queued = client.request('queued')
    const settled = Promise.allSettled([running, queued])
    await turn()
    await client.socket.onclose()
    blocked.resolve()
    await waitFor(settled)
    assert.ok(events.includes('running:persistence'))
    assert.ok(events.includes('running:notify'))
    assert.equal(events.includes('queued:preflight'), false)
    assert.equal(interactionIndex, 1)
  })
}

test('an old completion cannot clear the queue of a closed and recreated session', async () => {
  const original = await endpoint()
  const oldGate = gate('old'), replacementGate = gate('replacement')
  const oldRequest = original.request('old')
  await waitFor(milestone('old', 'effects').promise)
  const stale = original.request('stale')
  const oldRequests = Promise.allSettled([oldRequest, stale])
  await turn()
  const oldQueues = stateful.outstandingSideEffects[session]
  await original.socket.onclose()
  assert.equal(stateful.outstandingSideEffects[session], undefined)

  const replacement = await endpoint()
  const replacementRequest = replacement.request('replacement')
  await waitFor(milestone('replacement', 'effects').promise)
  const newQueues = stateful.outstandingSideEffects[session]
  const newTail = newQueues['resolved:document']
  assert.notEqual(newQueues, oldQueues)
  oldGate.resolve()
  await waitFor(oldRequests)
  await turn()
  assert.deepEqual(oldQueues, {})
  assert.equal(events.includes('stale:preflight'), false)
  assert.equal(newQueues['resolved:document'], newTail)

  const following = replacement.request('following')
  await turn()
  assert.deepEqual(startedEffects(), ['old:effects', 'replacement:effects'])
  replacementGate.resolve()
  await waitFor(Promise.all([replacementRequest, following]))
  await turn()
  assert.deepEqual(newQueues, {})
})

for (const patch of [undefined, null]) {
  test(`a ${patch} patch cannot strand the session queue before preflight`, async () => {
    const client = await endpoint()
    await waitFor(client.socket.onmessage({ scope: 'sessions', patch, si: 0 }))
    assert.ok(client.socket.sent.some(message => message.si === 0 && message.error))
    assert.deepEqual(events, [])
    assert.deepEqual(stateful.outstandingSideEffects[session], {})

    await waitFor(client.socket.onmessage({
      scope: 'sessions', si: 1,
      patch: [{ op: 'add', path: ['active', 'value'], value: 'following' }]
    }))
    assert.ok(client.socket.sent.some(message => message.si === 1 && message.ii))
    await turn()
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

for (const stage of ['preflight', 'effects', 'persistence', 'core', 'notify']) {
  test(`a synchronous ${stage} failure releases the queue for the next request`, async () => {
    const client = await endpoint()
    behaviors.set(`failed:${stage}`, new Error(`${stage} failed`))
    await waitFor(client.request('failed'))
    assert.ok(client.socket.sent.some(message => message.si === 0 && message.error))
    await waitFor(client.request('following'))
    assert.ok(client.socket.sent.some(message => message.si === 1 && message.ii))
    await turn()
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
    if (stage === 'preflight') assert.equal(events.includes('failed:effects'), false)
  })
}

for (const stage of ['preflight', 'persistence', 'core']) {
  test(`a rejected ${stage} promise releases the queue for the next request`, async () => {
    const client = await endpoint()
    const rejected = gate('failed', stage)
    const failed = client.request('failed')
    await waitFor(milestone('failed', stage).promise)
    rejected.reject(new Error(`${stage} failed`))
    await waitFor(failed)
    assert.ok(client.socket.sent.some(message => message.si === 0 && message.error))
    await waitFor(client.request('following'))
    assert.ok(client.socket.sent.some(message => message.si === 1 && message.ii))
    await turn()
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}

for (const stage of ['persistence', 'core', 'notify']) {
  test(`a ${stage} failure waits for started effects without deleting a newer tail`, async () => {
    const client = await endpoint()
    const firstGate = gate('failed'), secondGate = gate('following')
    if (stage === 'notify') unawaitedSends.add('failed')
    behaviors.set(`failed:${stage}`, new Error(`${stage} failed`))
    await waitFor(client.request('failed'))
    assert.ok(client.socket.sent.some(message => message.si === 0 && message.error))
    const following = client.request('following')
    await turn()
    const queues = stateful.outstandingSideEffects[session]
    const newestTail = queues['resolved:document']
    assert.deepEqual(startedEffects(), ['failed:effects'])
    firstGate.resolve()
    await waitFor(milestone('following', 'effects').promise)
    assert.equal(queues['resolved:document'], newestTail)
    secondGate.resolve()
    await waitFor(following)
    await turn()
    assert.deepEqual(queues, {})
  })
}

test('rejected domain effects are logged and do not poison the queue', async () => {
  const client = await endpoint()
  const rejected = gate('failed')
  const failed = client.request('failed')
  await waitFor(milestone('failed', 'effects').promise)
  const failure = new Error('domain effects failed')
  rejected.reject(failure)
  await waitFor(failed)
  const response = client.socket.sent.find(message => message.si === 0)
  assert.equal(response.error, undefined)
  assert.deepEqual(response.log, [failure])
  await waitFor(client.request('following'))
  await turn()
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

test('session queries release their queue while domain effects remain pending', async () => {
  const client = await endpoint()
  const blocked = gate('query')
  await waitFor(client.request('query', 'sessions', ['active', session, 'queries']))
  assert.ok(client.socket.sent.some(message => message.si === 0 && message.ii))
  await waitFor(client.request('following', 'sessions'))
  assert.deepEqual(startedEffects(), ['query:effects', 'following:effects'])
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
  blocked.resolve()
  await turn()
  assert.equal(client.socket.sent.filter(message => message.si === 0).length, 1)
  assert.deepEqual(stateful.outstandingSideEffects[session], {})
})

for (const rejects of [false, true]) {
  test(`unawaited sends preserve late ${rejects ? 'failed' : 'successful'} effects without blocking the queue`, async () => {
    const client = await endpoint()
    const blocked = gate('first')
    unawaitedSends.add('first')
    await waitFor(client.request('first'))
    assert.equal(client.socket.sent.some(message => message.si === 0), false)
    await waitFor(client.request('following'))
    assert.ok(client.socket.sent.some(message => message.si === 1 && message.ii))
    assert.deepEqual(stateful.outstandingSideEffects[session], {})

    const failure = new Error('late effects failed')
    if (rejects) blocked.reject(failure)
    else blocked.resolve()
    await turn()
    const response = client.socket.sent.find(message => message.si === 0)
    assert.equal(response.error, undefined)
    assert.deepEqual(response.response, rejects ? undefined : { worked: true })
    assert.deepEqual(response.log, rejects ? [failure] : [])
    assert.equal(client.socket.sent.filter(message => message.si === 0).length, 1)
    await waitFor(client.request('after-late-response'))
    assert.deepEqual(stateful.outstandingSideEffects[session], {})
  })
}
