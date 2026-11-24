import assert from 'node:assert/strict'
import { createRequire, registerHooks } from 'node:module'
import test, { after } from 'node:test'

const requireTest = createRequire(new URL('../../test/package.json', import.meta.url))
const { v5: uuidv5, validate: isUUID } = requireTest('uuid')
const fixtureKey = Symbol.for('knowlearning.upload-replay-test')
const currentFixture = `globalThis[Symbol.for('knowlearning.upload-replay-test')]`
const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map()
const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
const domain = 'uploads.example.test'
const user = '4a639830-b1e4-4ac1-9b85-348f06b49664'
const requestId = 'a1de777c-47e9-43a7-a5e3-24090ac80890'
const secondRequestId = '2b39011e-84ee-4894-9097-997ddbcbed4c'
const fileId = 'cc4fa1f1-49c0-4df6-afed-37dba3ea3690'
const secondFileId = 'bb6c36cf-2b92-4cb5-ab0f-f085f499142d'
const bucketName = 'upload-replay-test-bucket'
const defaultObjectId = '49ae5565-24d1-47c6-b681-819422496376'
const goldenObjectId = '291afcaa-5fc1-5644-a822-cb8381a4779b'

globalThis[fixtureKey] = { uuidv5, isUUID }

mock('utils.js', `
  export const uuidv5 = ${currentFixture}.uuidv5;
  export const isUUID = ${currentFixture}.isUUID;
  export const uuid = () => '${defaultObjectId}';
  export const environment = {
    MODE: 'production', GCS_BUCKET_NAME: '${bucketName}',
    GC_PROJECT_ID: 'upload-replay-test-project', GCS_SERVICE_ACCOUNT_CREDENTIALS: '{}',
    ADMIN_DOMAIN: 'admin.example.test', SUPER_ADMINS: []
  };
  export class createGCSClient {
    bucket(bucket) {
      return {
        file(objectId) {
          return {
            async getSignedUrl(options) {
              const fixture = ${currentFixture};
              fixture.events.push('sign');
              fixture.signatures.push({ bucket, objectId, options: { ...options } });
              if (fixture.signingError) throw fixture.signingError;
              if (fixture.signingGates?.has(objectId)) await fixture.signingGates.get(objectId);
              return ['https://storage.example.test/' + bucket + '/' + objectId + '?signature=' + fixture.signatures.length];
            }
          };
        }
      };
    }
  }
`)
mock('storage.js', `
  export async function upload(...args) {
    const fixture = ${currentFixture};
    fixture.uploadCalls.push(args);
    return fixture.realUpload(...args);
  }
`)
mock('persistence.js', `
  export async function flushPatchRecords() {};
  export async function patchState(...args) {
    const fixture = ${currentFixture};
    if (fixture.patchStateImplementation) return fixture.patchStateImplementation(...args);
    throw new Error('Unexpected direct persistence call');
  }
  export async function getState(...args) {
    const fixture = ${currentFixture};
    fixture.events.push('read');
    fixture.reads.push(args);
    if (fixture.readError) throw fixture.readError;
    const state = structuredClone(fixture.states.get(args[1]) ?? null);
    if (fixture.afterRead) await fixture.afterRead(...args);
    if (!state || !args[2]?.path) return state;
    return Object.fromEntries(args[2].path.map(path => [path, [state[path.slice(2)]]]));
  }
`)
mock('gcp-api.js', 'export async function queryBigQuery() { throw new Error("Unexpected BigQuery request"); }')
mock('interact.js', `
  export async function assertInteractionAllowed(...args) {
    const fixture = ${currentFixture};
    fixture.events.push('authorize');
    fixture.authorizations.push(args);
    if (fixture.authorizationError) throw fixture.authorizationError;
    if (fixture.useRealAuthorization) await fixture.realAssertInteractionAllowed(...args);
  }
  export default async function interact(...args) {
    const fixture = ${currentFixture};
    fixture.events.push('persist-start');
    fixture.interactions.push(args);
    if (fixture.useRealInteraction) return fixture.realInteract(...args);
    if (fixture.useRealAuthorization) await fixture.realAssertInteractionAllowed(...args);
    if (fixture.metadataGate) await fixture.metadataGate;
    if (fixture.metadataError) throw fixture.metadataError;
    if (fixture.commitMetadata) {
      const [domain, owner, id, patch] = args;
      const state = fixture.states.get(id) ?? { domain, owner };
      for (const operation of patch) {
        if (operation.op !== 'add' || operation.path.length !== 1) throw new Error('Unexpected metadata patch');
        state[operation.path[0]] = structuredClone(operation.value);
      }
      fixture.states.set(id, state);
      fixture.events.push('persist-commit');
    }
    return fixture.metadataResult;
  }
`)
mock('scope-to-id.js', 'export default async function scopeToId(domain, user, scope) { return scope; }')

const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url)
      ? { format: 'module', source: mocks.get(url), shortCircuit: true }
      : nextLoad(url, context)
  }
})
const { upload: realUpload } = await import('../source/storage.js?upload-replay-test')
const { default: realInteract, assertInteractionAllowed: realAssertInteractionAllowed } = await import('../source/interact.js?upload-replay-test')
const { default: handleUpload } = await import('../source/side-effects/uploads.js')
hooks.deregister()
after(() => { delete globalThis[fixtureKey] })

function expectedObjectId(overrides = {}) {
  const parameters = {
    domain, user, requestId, fileId, contentType: 'text/plain', signingType: 'text/plain',
    ...overrides
  }
  return uuidv5(JSON.stringify([
    'upload-v1', parameters.domain, parameters.user, parameters.requestId,
    parameters.fileId, parameters.contentType, parameters.signingType ?? null
  ]), uuidv5.URL)
}

function fixture() {
  const state = {
    realUpload, realInteract, realAssertInteractionAllowed, states: new Map(), events: [], reads: [], authorizations: [],
    interactions: [], uploadCalls: [], signatures: [], sent: [],
    metadataResult: { ii: 1 }, commitMetadata: true
  }
  globalThis[fixtureKey] = state
  return {
    state,
    handle(overrides = {}) {
      const { value = {}, patch, ...parameters } = overrides
      return handleUpload({
        id: requestId, scope: requestId, domain, user, session: 'upload-session', si: 7, ii: 1,
        patch: patch ?? [{ op: 'add', path: ['active'], value: { id: fileId, type: 'text/plain', name: 'Original name', ...value } }],
        send(message) {
          state.events.push('send')
          if (state.sendError) throw state.sendError
          state.sent.push(message)
        },
        ...parameters
      })
    }
  }
}

function currentMetadata(overrides = {}) {
  return {
    domain, owner: user, active_type: 'text/plain', external: true, name: 'Original name',
    active: { type: 'gcs', id: goldenObjectId, bucket: bucketName },
    ...overrides
  }
}

function assertNoStorageOrMetadata(state) {
  assert.deepEqual(state.uploadCalls, [])
  assert.deepEqual(state.signatures, [])
  assert.deepEqual(state.interactions, [])
  assert.deepEqual(state.sent, [])
}

test('upload replay: first revision signs the golden allocation and commits before responding', async () => {
  const harness = fixture()
  await harness.handle()
  const { state } = harness
  assert.equal(expectedObjectId(), goldenObjectId)
  assert.deepEqual(state.events, ['authorize', 'sign', 'persist-start', 'persist-commit', 'send'])
  assert.equal(state.authorizations.length, 1)
  assert.deepEqual(state.authorizations[0].slice(0, 3), [domain, user, fileId])
  assert.equal(state.interactions.length, 1)
  assert.deepEqual(state.interactions[0], [domain, user, fileId, [
    { op: 'add', path: ['active_type'], value: 'text/plain' },
    { op: 'add', path: ['active'], value: { type: 'gcs', id: goldenObjectId, bucket: bucketName } },
    { op: 'add', path: ['external'], value: true },
    { op: 'add', path: ['name'], value: 'Original name' }
  ]])
  assert.deepEqual(state.states.get(fileId), currentMetadata())
  assert.deepEqual(state.uploadCalls, [['text/plain', false, goldenObjectId]])
  assert.equal(state.signatures[0].objectId, goldenObjectId)
  assert.equal(state.signatures[0].bucket, bucketName)
  assert.equal(state.signatures[0].options.contentType, 'text/plain')
  assert.deepEqual(state.sent, [{ si: 7, ii: 1, url: `https://storage.example.test/${bucketName}/${goldenObjectId}?signature=1` }])
})

test('upload replay: completed repeated revisions only reauthorize and re-sign the same allocation', async () => {
  const harness = fixture()
  await harness.handle()
  const original = structuredClone(harness.state.states.get(fileId))
  for (const ii of [2, 3, 20]) await harness.handle({ ii, si: ii + 10 })
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.authorizations.length, 4)
  assert.equal(harness.state.reads.length, 3)
  assert.deepEqual(harness.state.states.get(fileId), original)
  assert.deepEqual(harness.state.signatures.map(signature => signature.objectId), Array(4).fill(goldenObjectId))
  assert.equal(new Set(harness.state.sent.map(message => message.url)).size, 4)
  assert.deepEqual(harness.state.sent.map(message => message.ii), [1, 2, 3, 20])
})

test('upload replay: uses the resolved request ID rather than its scope alias', async () => {
  const harness = fixture()
  await harness.handle({ scope: 'caller-scope-alias' })
  assert.equal(harness.state.signatures[0].objectId, goldenObjectId)
})

for (const [label, parameters, identity] of [
  ['domain', { domain: 'another.example.test' }, { domain: 'another.example.test' }],
  ['user', { user: 'c0444d1d-6bee-4ec1-9306-1f1443516d96' }, { user: 'c0444d1d-6bee-4ec1-9306-1f1443516d96' }],
  ['request', { id: secondRequestId }, { requestId: secondRequestId }],
  ['target', { value: { id: secondFileId } }, { fileId: secondFileId }],
  ['content type', { value: { type: 'image/png' } }, { contentType: 'image/png', signingType: 'image/png' }]
]) {
  test(`upload replay: ${label} isolates storage identity`, async () => {
    const harness = fixture()
    await harness.handle(parameters)
    const objectId = harness.state.signatures[0].objectId
    assert.notEqual(objectId, goldenObjectId)
    assert.equal(objectId, expectedObjectId(identity))
  })
}

test('upload replay: renaming the file does not change or restore its allocation', async () => {
  const harness = fixture()
  await harness.handle()
  harness.state.states.get(fileId).name = 'Newer name'
  await harness.handle({ ii: 2, value: { name: 'Changed request name' } })
  assert.equal(harness.state.states.get(fileId).name, 'Newer name')
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.signatures[1].objectId, goldenObjectId)
})

test('upload replay: a newer request replaces the file and an older replay cannot restore it', async () => {
  const harness = fixture()
  await harness.handle()
  await harness.handle({ id: secondRequestId, si: 8, value: { name: 'Replacement' } })
  const replacement = structuredClone(harness.state.states.get(fileId))
  assert.equal(replacement.active.id, expectedObjectId({ requestId: secondRequestId }))
  await assert.rejects(harness.handle({ ii: 2, si: 9 }))
  assert.deepEqual(harness.state.states.get(fileId), replacement)
  assert.equal(harness.state.interactions.length, 2)
  assert.equal(harness.state.signatures.length, 2)
  assert.equal(harness.state.sent.length, 2)
})

test('upload replay: replacement racing after validation cannot be overwritten by the replay', async () => {
  const harness = fixture()
  harness.state.states.set(fileId, currentMetadata())
  const replacement = currentMetadata({
    name: 'Concurrent replacement',
    active: { type: 'gcs', id: expectedObjectId({ requestId: secondRequestId }), bucket: bucketName }
  })
  harness.state.afterRead = () => harness.state.states.set(fileId, structuredClone(replacement))
  await harness.handle({ ii: 2 })
  assert.deepEqual(harness.state.states.get(fileId), replacement)
  assert.deepEqual(harness.state.interactions, [])
  assert.equal(harness.state.signatures[0].objectId, goldenObjectId)
})

for (const type of ['Image/SVG+XML', 'text/plain; charset="utf-8"', 'text/plain;charset=utf-8']) {
  test(`upload replay: preserves explicit MIME spelling ${JSON.stringify(type)} across retries`, async () => {
    const harness = fixture()
    await harness.handle({ value: { type } })
    await harness.handle({ ii: 2, value: { type } })
    const expected = expectedObjectId({ contentType: type, signingType: type })
    assert.equal(harness.state.interactions.length, 1)
    assert.equal(harness.state.states.get(fileId).active_type, type)
    assert.deepEqual(harness.state.signatures.map(signature => signature.objectId), [expected, expected])
    assert.deepEqual(harness.state.signatures.map(signature => signature.options.contentType), [type, type])
  })
}

for (const [label, metadata] of [
  ['missing state', null],
  ['missing active mapping', currentMetadata({ active: undefined })],
  ['legacy random object', currentMetadata({ active: { type: 'gcs', id: defaultObjectId, bucket: bucketName } })],
  ['another bucket', currentMetadata({ active: { type: 'gcs', id: goldenObjectId, bucket: 'untrusted-bucket' } })],
  ['missing bucket', currentMetadata({ active: { type: 'gcs', id: goldenObjectId } })],
  ['different storage type', currentMetadata({ active: { type: 'other', id: goldenObjectId, bucket: bucketName } })],
  ['missing external flag', currentMetadata({ external: undefined })],
  ['false external flag', currentMetadata({ external: false })],
  ['truthy nonboolean external flag', currentMetadata({ external: 'true' })],
  ['mismatched MIME', currentMetadata({ active_type: 'image/png' })],
  ['missing MIME', currentMetadata({ active_type: undefined })]
]) {
  test(`upload replay: ${label} fails closed without signing or rewriting`, async () => {
    const harness = fixture()
    if (metadata) harness.state.states.set(fileId, structuredClone(metadata))
    await assert.rejects(harness.handle({ ii: 2 }))
    assertNoStorageOrMetadata(harness.state)
    assert.deepEqual(harness.state.states.get(fileId), metadata ?? undefined)
  })
}

test('upload replay: an arbitrary forged pointer is never sent to the signer', async () => {
  const harness = fixture()
  const victimObject = expectedObjectId({ user: 'e13ff1e2-5280-4cd3-a891-f7ee037f2092' })
  harness.state.states.set(fileId, currentMetadata({
    active: { type: 'gcs', id: victimObject, bucket: bucketName, requestId }
  }))
  await assert.rejects(harness.handle({ ii: 2 }))
  assertNoStorageOrMetadata(harness.state)
})

for (const ii of [1, 2]) {
  test(`upload replay: authorization failure at revision ${ii} prevents signing and metadata writes`, async () => {
    const harness = fixture()
    harness.state.states.set(fileId, currentMetadata())
    harness.state.authorizationError = new Error('Not the file owner')
    await assert.rejects(harness.handle({ ii }), /Not the file owner/)
    assert.equal(harness.state.authorizations.length, 1)
    assertNoStorageOrMetadata(harness.state)
    assert.deepEqual(harness.state.states.get(fileId), currentMetadata())
  })

  test(`upload replay: real ownership checks allow the owner at revision ${ii}`, async () => {
    const harness = fixture()
    harness.state.useRealAuthorization = true
    harness.state.states.set(fileId, currentMetadata())
    await harness.handle({ ii })
    assert.equal(harness.state.signatures.length, 1)
    assert.equal(harness.state.signatures[0].objectId, goldenObjectId)
    assert.equal(harness.state.interactions.length, ii === 1 ? 1 : 0)
  })

  for (const [label, overrides] of [
    ['different owner', { owner: 'c0444d1d-6bee-4ec1-9306-1f1443516d96' }],
    ['different domain', { domain: 'another.example.test' }],
    ['credential session', { active_type: 'application/json;type=session' }]
  ]) {
    test(`upload replay: real authorization rejects ${label} at revision ${ii}`, async () => {
      const harness = fixture()
      harness.state.useRealAuthorization = true
      const metadata = currentMetadata(overrides)
      harness.state.states.set(fileId, metadata)
      await assert.rejects(harness.handle({ ii }))
      assertNoStorageOrMetadata(harness.state)
      assert.deepEqual(harness.state.states.get(fileId), metadata)
    })
  }
}

test('upload replay: structured identity does not confuse concatenated domain/user boundaries', async () => {
  const harness = fixture()
  await harness.handle({ domain: 'first/second', user: 'third' })
  await harness.handle({ domain: 'first', user: 'second/third' })
  assert.notEqual(harness.state.signatures[0].objectId, harness.state.signatures[1].objectId)
})

test('upload replay: the real interaction rechecks ownership after signing before the first write', async () => {
  const harness = fixture()
  harness.state.useRealAuthorization = true
  harness.state.useRealInteraction = true
  const previous = currentMetadata({ active: { type: 'gcs', id: defaultObjectId, bucket: bucketName } })
  harness.state.states.set(fileId, previous)
  let releaseSigner
  const signingGate = new Promise(resolve => { releaseSigner = resolve })
  harness.state.signingGates = new Map([[goldenObjectId, signingGate]])
  const first = harness.handle()
  const rejection = assert.rejects(first, /DOMAIN OR USER MISMATCH/)
  await new Promise(resolve => setImmediate(resolve))
  previous.owner = 'c0444d1d-6bee-4ec1-9306-1f1443516d96'
  releaseSigner()
  await rejection
  assert.equal(harness.state.signatures.length, 1)
  assert.equal(harness.state.events.includes('persist-commit'), false)
  assert.deepEqual(harness.state.states.get(fileId), previous)
  assert.deepEqual(harness.state.sent, [])
})

for (const ii of [undefined, null, 0, -1, 1.5, '1', true, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
  test(`upload replay: invalid request revision ${String(ii)} cannot allocate or sign`, async () => {
    const harness = fixture()
    await assert.rejects(harness.handle({ ii }))
    assertNoStorageOrMetadata(harness.state)
  })
}

for (const id of [undefined, null, '', 'named-scope', 123]) {
  for (const field of ['request', 'target']) {
    test(`upload replay: invalid ${field} ID ${JSON.stringify(id)} is rejected`, async () => {
      const harness = fixture()
      await assert.rejects(harness.handle(field === 'request' ? { id } : { value: { id } }))
      assertNoStorageOrMetadata(harness.state)
    })
  }
}

for (const result of [undefined, null, {}, { ii: 0 }, { ii: -1 }, { ii: 1.5 }, { ii: '1' }, { ii: NaN }, { ii: Infinity }, { ii: Number.MAX_SAFE_INTEGER + 1 }]) {
  test(`upload replay: invalid metadata confirmation ${JSON.stringify(result)} prevents a URL response`, async () => {
    const harness = fixture()
    harness.state.metadataResult = result
    harness.state.commitMetadata = false
    await assert.rejects(harness.handle())
    assert.equal(harness.state.interactions.length, 1)
    assert.equal(harness.state.uploadCalls.length, 1)
    assert.equal(harness.state.signatures.length, 1)
    assert.deepEqual(harness.state.sent, [])
  })
}

test('upload replay: rejected metadata write does not return the signed URL or report success', async () => {
  const harness = fixture()
  harness.state.metadataError = new Error('Metadata unavailable')
  await assert.rejects(harness.handle(), /Metadata unavailable/)
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.uploadCalls.length, 1)
  assert.equal(harness.state.signatures.length, 1)
  assert.deepEqual(harness.state.sent, [])
})

test('upload replay: committed metadata with a failed confirmation can be renewed without rewriting', async () => {
  const harness = fixture()
  harness.state.useRealAuthorization = true
  harness.state.useRealInteraction = true
  let persistenceCalls = 0
  harness.state.patchStateImplementation = (domain, owner, context, id, patch) => {
    persistenceCalls += 1
    const metadata = { domain, owner }
    for (const operation of patch) metadata[operation.path[0]] = structuredClone(operation.value)
    harness.state.states.set(id, metadata)
    throw new Error('Synchronization failed after Redis commit')
  }
  await assert.rejects(harness.handle())
  assert.deepEqual(harness.state.states.get(fileId), currentMetadata())
  assert.deepEqual(harness.state.sent, [])
  await harness.handle({ ii: 2 })
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(persistenceCalls, 1)
  assert.equal(harness.state.signatures.length, 2)
  assert.equal(harness.state.sent.length, 1)
  assert.equal(harness.state.signatures[1].objectId, goldenObjectId)
})

test('upload replay: signing failure preserves the existing file and an incomplete replay fails closed', async () => {
  const harness = fixture()
  const previous = currentMetadata({ active: { type: 'gcs', id: defaultObjectId, bucket: bucketName } })
  harness.state.states.set(fileId, previous)
  harness.state.signingError = new Error('Signer temporarily unavailable')
  await assert.rejects(harness.handle(), /Signer temporarily unavailable/)
  assert.deepEqual(harness.state.states.get(fileId), previous)
  assert.deepEqual(harness.state.interactions, [])
  assert.deepEqual(harness.state.sent, [])
  harness.state.signingError = null
  await assert.rejects(harness.handle({ ii: 2 }))
  assert.deepEqual(harness.state.states.get(fileId), previous)
  assert.deepEqual(harness.state.interactions, [])
  assert.equal(harness.state.signatures.length, 1)
  assert.deepEqual(harness.state.sent, [])
})

test('upload replay: initial signing failure does not create file metadata', async () => {
  const harness = fixture()
  harness.state.signingError = new Error('Signer unavailable')
  await assert.rejects(harness.handle(), /Signer unavailable/)
  assert.equal(harness.state.states.size, 0)
  assert.deepEqual(harness.state.interactions, [])
  assert.deepEqual(harness.state.sent, [])
})

test('upload replay: a lost response re-signs the committed allocation without another write', async () => {
  const harness = fixture()
  harness.state.sendError = new Error('Connection closed before response delivery')
  await assert.rejects(harness.handle(), /Connection closed/)
  harness.state.sendError = null
  await harness.handle({ ii: 2, si: 19 })
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.signatures.length, 2)
  assert.equal(harness.state.sent[0].si, 19)
  assert.equal(harness.state.sent[0].ii, 2)
  assert.deepEqual(harness.state.states.get(fileId), currentMetadata())
})

test('upload replay: concurrent repeat before first metadata commit fails without a second allocation', async () => {
  const harness = fixture()
  let releaseMetadata
  harness.state.metadataGate = new Promise(resolve => { releaseMetadata = resolve })
  const first = harness.handle()
  await new Promise(resolve => setImmediate(resolve))
  try {
    assert.equal(harness.state.interactions.length, 1)
    assert.equal(harness.state.signatures.length, 1)
    await assert.rejects(harness.handle({ ii: 2, si: 8 }))
    assert.equal(harness.state.interactions.length, 1)
    assert.equal(harness.state.signatures.length, 1)
    assert.deepEqual(harness.state.sent, [])
  }
  finally {
    releaseMetadata()
    await first
  }
  await harness.handle({ ii: 3, si: 9 })
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.signatures.length, 2)
  assert.deepEqual(harness.state.states.get(fileId), currentMetadata())
})

test('upload replay: a failed first write is not taken over by a later revision', async () => {
  const harness = fixture()
  harness.state.metadataError = new Error('First write failed')
  await assert.rejects(harness.handle(), /First write failed/)
  harness.state.metadataError = null
  await assert.rejects(harness.handle({ ii: 2 }))
  assert.equal(harness.state.interactions.length, 1)
  assert.equal(harness.state.signatures.length, 1)
  assert.deepEqual(harness.state.sent, [])
})

test('upload replay: a state read failure does not mint a write URL', async () => {
  const harness = fixture()
  harness.state.readError = new Error('Redis unavailable')
  await assert.rejects(harness.handle({ ii: 2 }), /Redis unavailable/)
  assertNoStorageOrMetadata(harness.state)
})

test('upload replay: alternating replacements and historical retries preserve the current mapping', async () => {
  const harness = fixture()
  const requests = []
  let currentRequest
  let successfulRenewals = 0
  let rejectedHistoricalRequests = 0

  for (let step = 0; step < 240; step += 1) {
    if (step % 4 === 0) {
      currentRequest = {
        id: uuidv5(`upload-replay-sequence-${step}`, uuidv5.URL),
        value: { type: step % 8 === 0 ? 'text/plain' : 'image/png', name: `Replacement ${step}` },
        ii: 1
      }
      requests.push(currentRequest)
      await harness.handle({ ...currentRequest, si: step })
      assert.equal(harness.state.states.get(fileId).active.id, expectedObjectId({
        requestId: currentRequest.id,
        contentType: currentRequest.value.type,
        signingType: currentRequest.value.type
      }))
    }
    else {
      const request = step % 4 === 1 ? currentRequest : requests[(step * 17) % requests.length]
      const snapshot = structuredClone(harness.state.states.get(fileId))
      const writes = harness.state.interactions.length
      const signatures = harness.state.signatures.length
      request.ii += 1

      if (request === currentRequest) {
        await harness.handle({ ...request, si: step })
        successfulRenewals += 1
        assert.equal(harness.state.signatures.length, signatures + 1)
        assert.equal(harness.state.signatures.at(-1).objectId, snapshot.active.id)
      }
      else {
        await assert.rejects(harness.handle({ ...request, si: step }))
        rejectedHistoricalRequests += 1
        assert.equal(harness.state.signatures.length, signatures)
      }

      assert.equal(harness.state.interactions.length, writes)
      assert.deepEqual(harness.state.states.get(fileId), snapshot)
    }
  }

  assert.equal(requests.length, 60)
  assert.equal(harness.state.interactions.length, requests.length)
  assert.ok(successfulRenewals >= 60)
  assert.ok(rejectedHistoricalRequests >= 60)
})

test('upload replay: the largest safe revision renews without changing storage identity', async () => {
  const harness = fixture()
  await harness.handle()
  const snapshot = structuredClone(harness.state.states.get(fileId))
  await harness.handle({ ii: Number.MAX_SAFE_INTEGER, si: 10 })
  assert.equal(harness.state.interactions.length, 1)
  assert.deepEqual(harness.state.states.get(fileId), snapshot)
  assert.equal(harness.state.signatures[1].objectId, goldenObjectId)
  assert.equal(harness.state.sent[1].ii, Number.MAX_SAFE_INTEGER)
})

test('upload replay: unrelated wrapper patches retain their ordinary response', async () => {
  const harness = fixture()
  await harness.handle({ ii: 8, patch: [{ op: 'add', path: ['name'], value: 'Renamed wrapper' }] })
  assert.deepEqual(harness.state.interactions, [])
  assert.deepEqual(harness.state.signatures, [])
  assert.deepEqual(harness.state.sent, [{ si: 7, ii: 8 }])
})
