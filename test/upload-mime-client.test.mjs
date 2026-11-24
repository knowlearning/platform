import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import normalizeUploadType from '../packages/agents/agents/upload-type.js'

const uploadURL = 'https://storage.test/upload'
const uploadId = '00000000-0000-4000-8000-000000000001'
const fallbackType = 'application/octet-stream'
const turn = () => new Promise(resolve => setImmediate(resolve))
const sources = await Promise.all([
  '../packages/agents/agents/generic/index.js',
  '../packages/agents/agents/generic/embedded.js',
  '../packages/agents/agents/embed.js'
].map(path => readFile(new URL(path, import.meta.url), 'utf8')))

function evaluate(source, name, dependencies) {
  return new Function(...Object.keys(dependencies), `${source.replace(/^import .*\n/gm, '').replace('export default function', 'function')}\nreturn ${name};`)(...Object.values(dependencies))
}

function fixture(kind) {
  const requests = []
  const fetches = []
  const pending = []
  let messageListener
  let generatedIds = 0
  const environment = () => new Promise(() => {})
  const fetch = async (url, options) => {
    fetches.push({ url, ...options })
    return { ok: true, statusText: 'OK' }
  }
  const dependencies = {
    isUUID: value => typeof value === 'string' && /^[0-9a-f-]{36}$/i.test(value),
    uuid: () => `00000000-0000-4000-8000-${String(++generatedIds + 100).padStart(12, '0')}`,
    normalizeUploadType,
    PatchProxy: class {},
    stateImplementation() {},
    attachSynced() {},
    watchImplementation: () => [() => {}, () => {}],
    downloadImplementation() {},
    sync() {},
    messageQueue: () => [
      request => {
        requests.push(request)
        const waiters = []
        pending.push(waiters)
        return new Promise((resolve, reject) => waiters.push({ resolve, reject }))
      },
      () => new Promise((resolve, reject) => pending.at(-1).push({ resolve, reject })),
      () => {},
      () => {},
      async () => {},
      environment
    ]
  }
  let agent
  if (kind === 'root') {
    const createAgent = evaluate(sources[0], 'Agent', dependencies)
    agent = createAgent({ uuid: dependencies.uuid, fetch, log: () => {} })
  }
  else {
    const createAgent = evaluate(sources[1], 'createEmbeddedAgent', dependencies)
    agent = createAgent({
      addMessageListener: listener => messageListener = listener,
      postMessage: message => { if (message.type === 'upload') requests.push(message) },
      fetch,
      log: () => {}
    })
    messageListener({ type: 'setup', session: 'upload-audit-session' })
  }
  return {
    agent,
    requests,
    fetches,
    info(index = 0) {
      return kind === 'root'
        ? requests[index].patch.find(operation => operation.path.length === 1 && operation.path[0] === 'active').value
        : requests[index].info
    },
    respond(response = uploadURL, error) {
      if (kind === 'root') {
        for (const waiter of pending.at(-1)) {
          if (error) waiter.reject(error)
          else waiter.resolve({ url: response, ii: 1 })
        }
      }
      else {
        messageListener({ session: 'upload-audit-session', requestId: requests.at(-1).requestId, response, error })
      }
    }
  }
}

for (const kind of ['root', 'embedded']) {
  for (const type of [undefined, null, '', ' \t ']) {
    test(`${kind}: data upload defaults ${JSON.stringify(type)} MIME in metadata and PUT headers`, async () => {
      const harness = fixture(kind)
      const data = new Uint8Array([1, 2, 3]).buffer
      const uploading = harness.agent.upload({ id: uploadId, name: 'file.bin', type, data })
      await turn()
      assert.equal(harness.requests.length, 1)
      assert.deepEqual(harness.info(), { id: uploadId, name: 'file.bin', type: fallbackType })
      harness.respond()
      assert.equal(await uploading, uploadId)
      assert.deepEqual(harness.fetches, [{ url: uploadURL, method: 'PUT', headers: { 'Content-Type': fallbackType }, body: data }])
    })

    test(`${kind}: URL-only upload preserves unsigned ${JSON.stringify(type)} MIME compatibility`, async () => {
      const harness = fixture(kind)
      const uploading = harness.agent.upload({ id: uploadId, type })
      await turn()
      assert.equal(harness.info().type, undefined)
      harness.respond()
      assert.equal(await uploading, uploadURL)
      assert.deepEqual(harness.fetches, [])
    })
  }

  for (const type of ['application/json', 'application/vnd.example+json', 'text/plain; charset=utf-8', 'multipart/form-data; boundary="quoted boundary"', ' Text/Plain; charset="UTF-8" ']) {
    test(`${kind}: preserves valid MIME ${JSON.stringify(type)} for URL signing and PUT`, async () => {
      const harness = fixture(kind)
      const uploading = harness.agent.upload({ id: uploadId, type, data: '' })
      await turn()
      assert.equal(harness.info().type, type)
      harness.respond()
      assert.equal(await uploading, uploadId)
      assert.equal(harness.fetches[0].headers['Content-Type'], type)
      assert.equal(harness.fetches[0].body, '')
      const requestingURL = harness.agent.upload({ id: uploadId, type })
      await turn()
      assert.equal(harness.info(1).type, type)
      harness.respond()
      assert.equal(await requestingURL, uploadURL)
      assert.equal(harness.fetches.length, 1)
    })
  }

  for (const type of [12, true, {}, [], 'text', '/plain', 'text/', 'text /plain', 'text/plain; charset', 'text/plain\r\nInjected: value', 'text/plain\n', '\n']) {
    test(`${kind}: rejects malformed MIME ${JSON.stringify(type)} before enqueue or PUT`, async () => {
      const harness = fixture(kind)
      await assert.rejects(harness.agent.upload({ type, data: 'payload' }), /Invalid upload MIME type/)
      await turn()
      assert.deepEqual(harness.requests, [])
      assert.deepEqual(harness.fetches, [])
    })
  }

  test(`${kind}: optional upload info requests an unsigned URL without PUT`, async () => {
    const harness = fixture(kind)
    const requestingURL = harness.agent.upload()
    await turn()
    assert.equal(harness.info().type, undefined)
    assert.equal(typeof harness.info().id, 'string')
    harness.respond()
    assert.equal(await requestingURL, uploadURL)
    assert.deepEqual(harness.fetches, [])
  })

  test(`${kind}: server rejection rejects upload without PUT or an unhandled request Promise`, async context => {
    const unhandled = []
    const onUnhandled = reason => unhandled.push(reason)
    process.on('unhandledRejection', onUnhandled)
    context.after(() => process.off('unhandledRejection', onUnhandled))
    const harness = fixture(kind)
    const failure = new Error('Upload metadata persistence failed')
    const uploading = harness.agent.upload({ id: uploadId, type: 'image/png', data: 'payload' })
    const rejected = assert.rejects(uploading, error => error === failure)
    await turn()
    harness.respond(undefined, failure)
    await rejected
    await turn()
    assert.deepEqual(unhandled, [])
    assert.deepEqual(harness.fetches, [])
  })
}

test('root upload retains the existing wrapper scope, metadata patch, name, and context shape', async () => {
  const harness = fixture('root')
  const uploading = harness.agent.upload({ id: uploadId, type: 'text/plain', name: 'file.txt' })
  await turn()
  const request = harness.requests[0]
  assert.notEqual(request.scope, uploadId)
  assert.deepEqual(request.context, [])
  assert.deepEqual(request.patch, [
    { op: 'add', path: ['active_type'], value: 'application/json;type=upload' },
    { op: 'add', path: ['active'], value: { id: uploadId, type: 'text/plain', name: 'file.txt' } },
    { op: 'add', path: ['name'], value: 'file.txt' }
  ])
  harness.respond()
  assert.equal(await uploading, uploadURL)
})

function embedBridge(parent) {
  const messages = []
  let messageListener
  let loadHandler
  const session = 'legacy-child-session'
  const window = {
    location: { protocol: 'https:' },
    addEventListener: (_type, listener) => messageListener = listener
  }
  const target = {
    load() { loadHandler() },
    postMessage(message) {
      messages.push(message)
      if (message.type === 'setup') messageListener({ data: { type: 'embedded-ready', session } })
    },
    setLoadHandler: handler => loadHandler = handler,
    remove() {},
    isMounted: () => true
  }
  const createEmbed = evaluate(sources[2], 'createEmbed', { uuid: () => session, validateUUID: () => false, isDomain: () => false, window })
  createEmbed(() => parent.agent)({ id: 'https://legacy-child.test/' }, target)
  return {
    messages,
    upload: info => messageListener({ data: { type: 'upload', session, requestId: 'legacy-upload', info } })
  }
}

for (const kind of ['root', 'embedded']) {
  test(`legacy nested child retains unsigned MIME through a new ${kind} parent`, async () => {
    const harness = fixture(kind)
    const bridge = embedBridge(harness)
    bridge.upload({ id: uploadId, name: 'legacy.bin' })
    await turn()
    assert.equal(harness.info().type, undefined)
    harness.respond()
    await turn()
    assert.equal(bridge.messages.find(message => message.requestId === 'legacy-upload').response, uploadURL)
    assert.deepEqual(harness.fetches, [])
  })

  test(`${kind} parent forwards upload rejection to its embedded child`, async () => {
    const harness = fixture(kind)
    const bridge = embedBridge(harness)
    bridge.upload({ id: uploadId, type: 'image/png' })
    await turn()
    harness.respond(undefined, new Error('Upload metadata persistence failed'))
    await turn()
    const response = bridge.messages.find(message => message.requestId === 'legacy-upload')
    assert.equal(response.error, 'Upload metadata persistence failed')
    assert.equal(response.response, null)
    assert.deepEqual(harness.fetches, [])
  })
}
