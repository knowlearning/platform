import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { after } from 'node:test'

const fixtureKey = Symbol.for('knowlearning.upload-mime-test')
const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map()
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const currentFixture = `globalThis[Symbol.for('knowlearning.upload-mime-test')]`

mock('utils.js', `
  export const environment = {
    MODE: 'production',
    GCS_BUCKET_NAME: 'upload-test-bucket',
    GC_PROJECT_ID: 'upload-test-project',
    GCS_SERVICE_ACCOUNT_CREDENTIALS: '{}'
  };
  export const uuid = () => 'generated-storage-object';
  export class createGCSClient {
    bucket(bucketName) {
      return {
        file(objectId) {
          return {
            async getSignedUrl(options) {
              const fixture = ${currentFixture};
              fixture.signatures.push({ bucketName, objectId, options: { ...options } });
              if (fixture.storageError) throw fixture.storageError;
              return [fixture.url];
            }
          };
        }
      };
    }
  }
`)
mock('persistence.js', 'export async function flushPatchRecords() {}; export async function getState() { throw new Error("Unexpected state read"); }')
mock('gcp-api.js', 'export async function queryBigQuery() { throw new Error("Unexpected BigQuery request"); }')
mock('storage.js', `
  export async function upload(...args) {
    const fixture = ${currentFixture};
    fixture.uploadCalls.push(args);
    return fixture.realUpload(...args);
  }
`)
mock('interact.js', `
  export default async function interact(...args) {
    const fixture = ${currentFixture};
    fixture.interactions.push(args);
    if (fixture.metadataError) throw fixture.metadataError;
    return fixture.metadataResult;
  }
`)

const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url)
      ? { format: 'module', source: mocks.get(url), shortCircuit: true }
      : nextLoad(url, context)
  }
})
const { upload: realUpload } = await import('../source/storage.js?upload-mime-test')
const { default: handleUpload } = await import('../source/side-effects/uploads.js')
hooks.deregister()
after(() => { delete globalThis[fixtureKey] })

function fixture() {
  const state = {
    realUpload,
    uploadCalls: [],
    signatures: [],
    interactions: [],
    sent: [],
    url: 'https://storage.example.test/upload-test-bucket/generated-storage-object?signature=test',
    metadataResult: { ii: 12 }
  }
  globalThis[fixtureKey] = state
  return {
    ...state,
    state,
    handle(value, patch) {
      return handleUpload({
        domain: 'upload-test.example', user: 'upload-owner', session: 'upload-session', si: 7, ii: 11,
        patch: patch || [{ op: 'add', path: ['active'], value: { id: 'upload-state', name: 'Upload name', ...value } }],
        send: message => state.sent.push(message)
      })
    }
  }
}

function verifyMetadata(harness, type) {
  assert.equal(harness.interactions.length, 1)
  const [domain, user, id, patch] = harness.interactions[0]
  assert.equal(domain, 'upload-test.example')
  assert.equal(user, 'upload-owner')
  assert.equal(id, 'upload-state')
  assert.deepEqual(patch, [
    { op: 'add', path: ['active_type'], value: type },
    { op: 'add', path: ['active'], value: { type: 'gcs', id: 'generated-storage-object', bucket: 'upload-test-bucket' } },
    { op: 'add', path: ['external'], value: true },
    { op: 'add', path: ['name'], value: 'Upload name' }
  ])
  assert.deepEqual(harness.sent, [{ si: 7, ii: 11, url: harness.url }])
}

for (const [label, value] of [
  ['omitted', {}],
  ['undefined', { type: undefined }],
  ['null', { type: null }],
  ['empty', { type: '' }],
  ['spaces', { type: '   ' }],
  ['tabs and spaces', { type: ' \t ' }]
]) {
  test(`upload MIME: ${label} stores binary metadata without requiring a new signed Content-Type header`, async () => {
    const harness = fixture()
    await harness.handle(value)
    verifyMetadata(harness, 'application/octet-stream')
    assert.equal(harness.uploadCalls.length, 1)
    assert.equal(harness.signatures.length, 1)
    assert.equal(Boolean(harness.signatures[0].options.contentType), false)
    assert.equal(harness.signatures[0].options.action, 'write')
    assert.equal(harness.signatures[0].options.version, 'v4')
  })
}

for (const type of [
  'application/json',
  'Image/SVG+XML',
  'application/vnd.example+json;charset=UTF-8',
  'text/plain; charset=utf-8',
  'text/plain; charset="utf-8"',
  'application/json; profile="https://example.test/schema;v=1"',
  'text/plain; title="a \\"quoted\\" value"',
  '\ttext/plain\t; charset=utf-8\t'
]) {
  test(`upload MIME: preserves valid explicit ${JSON.stringify(type)} in metadata and signing`, async () => {
    const harness = fixture()
    await harness.handle({ type })
    verifyMetadata(harness, type)
    assert.equal(harness.signatures[0].options.contentType, type)
  })
}

for (const type of [
  0, false, {}, [],
  'plain', 'text/', '/plain', 'text /plain', 'text/plain, application/json',
  'text/plain; charset', 'text/plain; charset=', 'text/plain; =utf-8',
  'text/plain; charset="unterminated', 'text/plain; charset="utf-8"junk',
  'text/plain; charset=ut f-8', 'text/plain;', 'text/pläin',
  'text/plain\u0000', 'text/plain\r\nx-test: yes', '\r\n', 'text/plain\n', '\n'
]) {
  test(`upload MIME: rejects malformed ${JSON.stringify(type)} before storage or metadata calls`, async () => {
    const harness = fixture()
    await assert.rejects(harness.handle({ type }))
    assert.deepEqual(harness.uploadCalls, [])
    assert.deepEqual(harness.signatures, [])
    assert.deepEqual(harness.interactions, [])
    assert.deepEqual(harness.sent, [])
  })
}

for (const [label, result] of [
  ['empty metadata result', {}],
  ['missing metadata result', undefined],
  ['null metadata result', null],
  ['undefined metadata index', { ii: undefined }],
  ['null metadata index', { ii: null }],
  ['string metadata index', { ii: '12' }],
  ['NaN metadata index', { ii: NaN }],
  ['infinite metadata index', { ii: Infinity }]
]) {
  test(`upload MIME: ${label} does not return a signed URL`, async () => {
    const harness = fixture()
    harness.state.metadataResult = result
    await assert.rejects(harness.handle({ type: 'text/plain' }))
    assert.equal(harness.uploadCalls.length, 1)
    assert.equal(harness.interactions.length, 1)
    assert.deepEqual(harness.sent, [])
  })
}

test('upload MIME: rejected metadata persistence does not return a signed URL', async () => {
  const harness = fixture()
  harness.state.metadataError = new Error('Persistence rejected')
  await assert.rejects(harness.handle({ type: 'text/plain' }))
  assert.equal(harness.uploadCalls.length, 1)
  assert.equal(harness.interactions.length, 1)
  assert.deepEqual(harness.sent, [])
})

for (const ii of [0, 1, 12]) {
  test(`upload MIME: confirmed metadata index ${ii} permits the URL response`, async () => {
    const harness = fixture()
    harness.state.metadataResult = { ii }
    await harness.handle({ type: 'text/plain' })
    verifyMetadata(harness, 'text/plain')
  })
}

test('upload MIME: waits for metadata confirmation before returning the signed URL', async () => {
  const harness = fixture()
  let confirmMetadata
  harness.state.metadataResult = new Promise(resolve => { confirmMetadata = resolve })
  const completion = harness.handle({ type: 'text/plain' })
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(harness.signatures.length, 1)
  assert.equal(harness.interactions.length, 1)
  assert.deepEqual(harness.sent, [])
  confirmMetadata({ ii: 0 })
  await completion
  verifyMetadata(harness, 'text/plain')
})

test('upload MIME: storage signing failure does not mutate metadata or send a URL', async () => {
  const harness = fixture()
  harness.state.storageError = new Error('Storage signer rejected')
  await assert.rejects(harness.handle({ type: 'text/plain' }))
  assert.equal(harness.signatures.length, 1)
  assert.deepEqual(harness.interactions, [])
  assert.deepEqual(harness.sent, [])
})

test('upload MIME: a patch unrelated to upload creation keeps its ordinary response', async () => {
  const harness = fixture()
  await harness.handle(undefined, [{ op: 'add', path: ['name'], value: 'Renamed' }])
  assert.deepEqual(harness.uploadCalls, [])
  assert.deepEqual(harness.interactions, [])
  assert.deepEqual(harness.sent, [{ si: 7, ii: 11 }])
})
