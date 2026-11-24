import assert from 'node:assert/strict'
import { registerHooks } from 'node:module'
import test, { after } from 'node:test'

const fixtureKey = Symbol.for('knowlearning.upload-storage-test')
const currentFixture = `globalThis[Symbol.for('knowlearning.upload-storage-test')]`
const sourceRoot = new URL('../source/', import.meta.url)
const environment = {
  MODE: 'production',
  GCS_BUCKET_NAME: 'upload-storage-test-bucket',
  GC_PROJECT_ID: 'upload-storage-test-project',
  GCS_SERVICE_ACCOUNT_CREDENTIALS: '{}',
  INTERNAL_GCS_API_ENDPOINT: 'https://internal-storage.test:4443',
  EXTERNAL_GCS_API_ENDPOINT: 'https://external-storage.test:4443'
}
globalThis[fixtureKey] = { environment }
const mocks = new Map()
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
mock('utils.js', `
  export const environment = ${currentFixture}.environment;
  export const uuid = () => 'generated-object-' + ++${currentFixture}.generated;
  export class createGCSClient {
    bucket(bucket) {
      return {
        file(objectId) {
          return {
            async getSignedUrl(options) {
              const fixture = ${currentFixture};
              fixture.signatures.push({ bucket, objectId, options: { ...options } });
              if (fixture.signingError) throw fixture.signingError;
              return ['https://signer.test/' + bucket + '/' + objectId + '?signature=test&expires=' + options.expires];
            }
          };
        }
      };
    }
  }
`)
mock('persistence.js', 'export async function flushPatchRecords() {}; export async function getState() { throw new Error("Unexpected state read"); }')
mock('gcp-api.js', 'export async function queryBigQuery() { throw new Error("Unexpected BigQuery request"); }')
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url)
      ? { format: 'module', source: mocks.get(url), shortCircuit: true }
      : nextLoad(url, context)
  }
})
const { upload } = await import('../source/storage.js?upload-storage-production')
environment.MODE = 'local'
const { upload: localUpload } = await import('../source/storage.js?upload-storage-local')
hooks.deregister()
after(() => { delete globalThis[fixtureKey] })

function fixture() {
  return globalThis[fixtureKey] = { generated: 0, signatures: [] }
}

test('storage upload retains fresh generated object IDs when no override is supplied', async () => {
  const state = fixture()
  const first = await upload('text/plain')
  const second = await upload('text/plain')
  assert.equal(state.generated, 2)
  assert.notEqual(first.info.id, second.info.id)
  assert.deepEqual(state.signatures.map(signature => signature.objectId), [first.info.id, second.info.id])
  assert.deepEqual(first.info, { type: 'gcs', id: 'generated-object-1', bucket: environment.GCS_BUCKET_NAME })
})

test('storage upload uses the supplied object ID without generating a replacement', async () => {
  const state = fixture()
  const objectId = 'ab69325b-476f-5558-ac87-9f45b7d05897'
  const result = await upload('text/plain', false, objectId)
  assert.equal(state.generated, 0)
  assert.equal(state.signatures[0].objectId, objectId)
  assert.deepEqual(result.info, { type: 'gcs', id: objectId, bucket: environment.GCS_BUCKET_NAME })
  assert.equal(new URL(result.url).pathname, `/${environment.GCS_BUCKET_NAME}/${objectId}`)
})

test('storage upload retains the default ID when the override is explicitly undefined', async () => {
  const state = fixture()
  const result = await upload('text/plain', false, undefined)
  assert.equal(state.generated, 1)
  assert.equal(result.info.id, 'generated-object-1')
})

test('storage upload renews a fifteen-minute v4 write signature for the same explicit object', async context => {
  const state = fixture()
  let now = 1700000000000
  context.mock.method(Date, 'now', () => now)
  const first = await upload('Text/Plain; charset=utf-8', false, 'stable-object')
  now += 120000
  const second = await upload('Text/Plain; charset=utf-8', false, 'stable-object')
  assert.deepEqual(first.info, second.info)
  assert.notEqual(first.url, second.url)
  assert.deepEqual(state.signatures.map(signature => signature.options), [
    { version: 'v4', action: 'write', expires: 1700000900000, contentType: 'Text/Plain; charset=utf-8' },
    { version: 'v4', action: 'write', expires: 1700001020000, contentType: 'Text/Plain; charset=utf-8' }
  ])
})

for (const type of [undefined, null, '', 'text/plain', 'Text/Plain; charset=utf-8']) {
  test(`storage upload preserves existing signer Content-Type policy for ${JSON.stringify(type)}`, async () => {
    const state = fixture()
    await upload(type, false, 'stable-object')
    assert.equal(state.signatures[0].options.contentType, type)
  })
}

test('storage upload leaves production signed URLs unchanged for internal requests', async () => {
  const state = fixture()
  const result = await upload('text/plain', true, 'stable-object')
  assert.equal(result.url, `https://signer.test/${environment.GCS_BUCKET_NAME}/stable-object?signature=test&expires=${state.signatures[0].options.expires}`)
})

test('storage upload rewrites local external URLs while preserving object ID and signature query', async () => {
  const state = fixture()
  const result = await localUpload('text/plain', false, 'stable-object')
  assert.equal(result.url, `${environment.EXTERNAL_GCS_API_ENDPOINT}/${environment.GCS_BUCKET_NAME}/stable-object?signature=test&expires=${state.signatures[0].options.expires}`)
  assert.equal(result.info.id, 'stable-object')
})

test('storage upload retains local internal media endpoint rewriting for an explicit object', async () => {
  fixture()
  const result = await localUpload('text/plain', true, 'stable-object')
  assert.equal(result.url, `${environment.INTERNAL_GCS_API_ENDPOINT}/storage/v1/b/${environment.GCS_BUCKET_NAME}/o/stable-object?alt=media`)
  assert.equal(result.info.id, 'stable-object')
})

test('storage upload propagates signer failures without generating another object', async () => {
  const state = fixture()
  state.signingError = new Error('Signer unavailable')
  await assert.rejects(upload('text/plain', false, 'stable-object'), state.signingError)
  assert.equal(state.generated, 0)
  assert.equal(state.signatures.length, 1)
})
