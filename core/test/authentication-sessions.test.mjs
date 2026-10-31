import test, { beforeEach, after } from 'node:test'
import assert from 'node:assert/strict'
import { createHash, randomUUID, webcrypto } from 'node:crypto'
import { registerHooks } from 'node:module'
import { DatabaseSync } from 'node:sqlite'
import { assertSessionPatchAllowed, SESSION_OWNER, SESSION_TYPE } from '../source/authenticate/session-protection.js'
import { NEW_SESSION_QUERY, REATTACHING_SESSION_QUERY } from '../source/authenticate/queries.js'
import PatchProxy from '../../packages/patch-proxy/index.js'

// Exercise the real authentication, credential writer, mutation guard, and SQL.
// Only persistence, provider verification, and encryption are isolated here.
const environment = { ADMIN_DOMAIN: 'admin.test', SUPER_ADMINS: ['admin-user'], AUTH_SERVICE_SECRET_KEY: 'test-only-private-key', OAUTH_CREDENTIALS: '{}', SECRET_ENCRYPTION_KEY: 'fixture-encryption-key' }
const states = new Map(), databases = new Map(), writes = []
let tokenCalls = 0
const stateKey = (domain, id) => `${domain}/${id}`
function database(domain) {
  if (!databases.has(domain)) {
    const db = new DatabaseSync(':memory:')
    db.exec(`
      CREATE TABLE sessions (id TEXT PRIMARY KEY, session_credential TEXT, user_id TEXT, provider TEXT, sid_encrypted_info TEXT);
      CREATE TABLE metadata (id TEXT PRIMARY KEY, domain TEXT, owner TEXT, active_type TEXT, created INTEGER);
    `)
    databases.set(domain, db)
  }
  return databases.get(domain)
}
function synchronize(domain, id, state) {
  const db = database(domain)
  db.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?, ?, ?, ?)')
    .run(id, state.domain, state.owner, state.active_type, state.created)
  if (state.active_type === SESSION_TYPE) {
    const active = state.active || {}
    db.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?)')
      .run(id, active.session_credential, active.user_id, active.provider, active.sid_encrypted_info)
  }
}
function putState(domain, id, state) {
  states.set(stateKey(domain, id), state)
  synchronize(domain, id, state)
}
async function scopeToId(domain, owner, scope) {
  const id = scope
  if (!states.has(stateKey(domain, id))) {
    putState(domain, id, { domain, owner, active_type: 'application/json', created: Date.now(), ii: 0 })
  }
  return id
}
async function getState(domain, id, { path } = {}) {
  const state = states.get(stateKey(domain, id))
  if (!state) return null
  return path ? Object.fromEntries(path.map(key => [key, [state[key.slice(2)]]])) : state
}
async function patchState(domain, user, context, id, patch, timestamp, name) {
  writes.push({ domain, user, context, id, patch, timestamp, name })
  const state = states.get(stateKey(domain, id))
  for (const operation of patch) {
    const { path, from, value, op } = operation
    let target = state
    for (const part of path.slice(0, -1)) target = target[part] ??= {}
    if (op === 'move') {
      // Production Redis moves use the destination array and final source index.
      const [moved] = target.splice(from.at(-1), 1)
      target.splice(path.at(-1), 0, moved)
    }
    else if (op === 'add' && Number.isInteger(path.at(-1))) {
      target.splice(path.at(-1) === -1 ? target.length : path.at(-1), 0, structuredClone(value))
    }
    else if (op === 'remove' && Number.isInteger(path.at(-1))) target.splice(path.at(-1), 1)
    else if (op === 'remove') delete target[path.at(-1)]
    else target[path.at(-1)] = structuredClone(value)
  }
  state.ii++
  synchronize(domain, id, state)
  return { ii: state.ii, type: state.active_type }
}
async function query(domain, sql, params) {
  const bindings = Object.fromEntries(params.map((value, index) => [`$${index + 1}`, value]))
  return { rows: database(domain).prepare(sql).all(bindings) }
}

const fixtureName = Symbol.for('knowlearning.session-protection-test')
const childUser = '00000000-0000-4000-8000-000000000004'
const credentialId = '00000000-0000-4000-8000-000000000005'
globalThis[fixtureName] = {
  environment, getState, patchState, scopeToId, query,
  async authenticateToken(_domain, token) {
    tokenCalls++
    return { user: randomUUID(), provider: token === 'verified-login' ? 'google' : 'anonymous', info: { name: 'Test user' } }
  },
  uuid: randomUUID,
  isUUID: value => /^[0-9a-f-]{36}$/i.test(value),
  cryptoDigest: (algorithm, data) => webcrypto.subtle.digest(algorithm, data),
  encryptSymmetric: async (_key, value) => value,
  decryptSymmetric: async (_key, value) => value,
  uuidv5: () => credentialId,
  decodeBase64: () => new Uint8Array(32),
  async decryptBase64String(_key, value) {
    if (value === 'credential-code') return JSON.stringify({ userPublicKey: 'user-public-key', userEncryptedInfo: 'user-proof' })
    return JSON.stringify({ domain: 'reports.test', provider: 'custom-provider', code: 'credential-code' })
  },
  decryptJSON(_secretKey, publicKey, encrypted) {
    if (encrypted === 'user-proof') {
      assert.equal(publicKey, 'user-public-key')
      return { created: Date.now(), providerEncryptedInfo: 'provider-proof' }
    }
    assert.equal(publicKey, 'provider-public-key')
    assert.equal(encrypted, 'provider-proof')
    return { user: childUser, info: { name: 'Child user' } }
  }
}
const stub = names => `const fixture = globalThis[Symbol.for('knowlearning.session-protection-test')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
const sourceRoot = new URL('../source/', import.meta.url)
const mocks = new Map([
  [new URL('utils.js', sourceRoot).href, `${stub(['environment', 'uuid', 'isUUID', 'cryptoDigest', 'encryptSymmetric', 'decryptSymmetric', 'uuidv5', 'decodeBase64', 'decryptBase64String'])}\nexport const jwt = {}; export const jwkToPem = {}; export const box = {};`],
  [new URL('persistence.js', sourceRoot).href, stub(['getState', 'patchState'])],
  [new URL('postgres.js', sourceRoot).href, stub(['query'])],
  [new URL('scope-to-id.js', sourceRoot).href, `${stub(['scopeToId'])}\nexport default scopeToId;`],
  [new URL('authenticate/authenticate-token.js', sourceRoot).href, `${stub(['authenticateToken'])}\nexport default authenticateToken;`],
  [new URL('authenticate/decrypt-json.js', sourceRoot).href, `${stub(['decryptJSON'])}\nexport default decryptJSON;`],
  [new URL('authenticate/verify-jwt.js', sourceRoot).href, 'export default () => { throw new Error("Unexpected provider verification") }']
])
const hooks = registerHooks({
  load(url, context, nextLoad) {
    return mocks.has(url) ? { format: 'module', source: mocks.get(url), shortCircuit: true } : nextLoad(url, context)
  }
})
const { default: interact } = await import('../source/interact.js')
const { default: saveSession } = await import('../source/authenticate/save-session.js')
const { default: authenticate } = await import('../source/authenticate/index.js')
// Load the actual code-auth policy separately from the provider stub above.
const { default: authenticateCodeToken } = await import('../source/authenticate/authenticate-token.js?session-policy-test')
const hash = await import('../source/authenticate/hash.js')
hooks.deregister()

beforeEach(() => {
  for (const db of databases.values()) db.close()
  databases.clear()
  states.clear()
  writes.length = 0
  tokenCalls = 0
})
after(() => {
  for (const db of databases.values()) db.close()
  delete globalThis[fixtureName]
})

const domain = 'reports.test', user = '00000000-0000-4000-8000-000000000001'
const session = '00000000-0000-4000-8000-000000000002', sid = 'test-browser-session-secret'
const change = (path, value = 'changed', op = 'add') => [{ op, path, value }]

test('ordinary writes, upload and custom metadata, and named sessions telemetry remain available', async () => {
  await interact(domain, user, 'document', change(['active'], { score: 1, items: [1, 2] }))
  const { owner, domain: storedDomain, created } = await getState(domain, 'document')
  await interact(domain, user, 'document', change(['name'], 'Report'))
  await interact(domain, user, 'document', change(['active_type'], 'application/json;type=report'))
  await interact(domain, user, 'document', change(['external'], true))
  await interact(domain, user, 'document', change(['status'], 'ready'))
  await interact(domain, user, 'document', [{ op: 'move', from: ['active', 'items', 0], path: ['active', 'items', 1] }])
  await interact(domain, user, 'document', change(['queue'], [1, 2, 3]))
  // Persistence moves only within the destination array; source prefixes are
  // ignored, and numeric string/negative indices keep their existing meaning.
  for (const [from, destination, expected] of [
    [['owner', 0], 2, [2, 3, 1]],
    [['domain', '2'], '0', [1, 2, 3]],
    [['created', -1], 0, [3, 1, 2]],
    [[String.raw`\u006fwner`, 0], -1, [1, 3, 2]]
  ]) {
    await interact(domain, user, 'document', [{ op: 'move', from, path: ['queue', destination] }])
    const document = await getState(domain, 'document')
    assert.deepEqual(document.queue, expected)
    assert.deepEqual([document.owner, document.domain, document.created], [owner, storedDomain, created])
  }
  await interact(domain, user, 'sessions', change(['active', session, 'log'], 'connected'))
  await interact(domain, user, 'sessions', [])
  assert.equal(writes.length, 13)
  assert.equal((await getState(domain, 'document')).status, 'ready')
  assert.equal((await getState(domain, 'sessions')).owner, user)
  assert.equal((await getState(domain, 'sessions')).active[session].log, 'connected')
})

test('SDK array mutations remain accepted and persist at root and nested paths', async () => {
  const cases = [
    ['sort', [5, 3, 3, 1, 43, 64, 128, 8, 4], array => array.sort()],
    ['sort-comparator', [3, 1, 2], array => array.sort((a, b) => b - a)],
    ['reverse', [3, 1, 2], array => array.reverse()],
    ['push', [3, 1, 2], array => array.push(4, 5)],
    ['push-child', [], array => { array.push({ value: 1 }); array[0].value = 2 }],
    ['pop', [3, 1, 2], array => array.pop()],
    ['pop-empty', [], array => array.pop()],
    ['shift', [3, 1, 2], array => array.shift()],
    ['shift-empty', [], array => array.shift()],
    ['unshift', [3, 1, 2], array => array.unshift(4, 5)],
    ['splice-replace', [3, 1, 2], array => array.splice(1, 1, 8, 9)],
    ['splice-insert', [3, 1, 2], array => array.splice(1, 0, 8, 9)],
    ['splice-tail', [3, 1, 2], array => array.splice(2)],
    ['splice-noop', [3, 1, 2], array => array.splice()],
    ['index-replace', [3, 1, 2], array => { array[1] = 8 }],
    ['index-append', [3, 1, 2], array => { array[array.length] = 8 }],
    ['fill', [3, 1, 2], array => array.fill(8, 1)],
    ['empty-sort', [], array => array.sort()],
    ['empty-reverse', [], array => array.reverse()],
    ['sort-child', [{ value: 3 }, { value: 1 }, { value: 2 }], array => {
      array.sort((a, b) => a.value - b.value); array[0].value = 4
    }],
    ['reverse-child', [{ value: 3 }, { value: 1 }], array => { array.reverse(); array[0].value = 4 }],
    ['unshift-child', [{ value: 3 }], array => { array.unshift({ value: 1 }); array[1].value = 4 }],
    ['shift-child', [{ value: 3 }, { value: 1 }], array => { array.shift(); array[0].value = 4 }],
    ['splice-child', [{ value: 3 }], array => { array.splice(0, 0, { value: 1 }); array[1].value = 4 }],
    ['nested-array', [[3, 1], [4, 2]], array => { array[1].sort(); array[0].push(5) }]
  ]
  for (const path of [[], ['items'], ['nested', 'items'], ['owner'], ['active'], ['active', 'owner'], ['groups', 0]]) {
    for (const [name, values, mutate] of cases) {
      const initial = path.reduceRight((value, key) => typeof key === 'number' ? [value] : { [key]: value }, structuredClone(values))
      const expected = structuredClone(values)
      mutate(expected)
      const scope = `array-${name}-${path.join('-')}`
      await interact(domain, user, scope, change(['active'], structuredClone(initial)))
      const pending = [], generated = [], before = writes.length
      const state = PatchProxy(structuredClone(initial), patch => {
        // Both Agent SDKs prefix path only; from stays relative to application data.
        const activePatch = structuredClone(patch)
        for (const entry of activePatch) entry.path.unshift('active')
        generated.push(...structuredClone(activePatch))
        pending.push(interact(domain, user, scope, activePatch))
      })
      const array = path.reduce((value, key) => value[key], state)
      mutate(array)
      await assert.doesNotReject(Promise.all(pending), scope)
      assert.ok(generated.filter(({ op }) => op === 'move').every(({ path, from }) => from.length === path.length - 1), scope)
      assert.deepEqual(writes.slice(before).flatMap(write => write.patch), generated, scope)
      const stored = path.reduce((value, key) => value[key], (await getState(domain, scope)).active)
      assert.deepEqual(stored, expected, scope)
    }
  }
})

test('guard accepts SDK splice and delete shapes without changing their existing semantics', () => {
  // These SDK operations have existing local/persistence differences. This
  // check covers admission only; it does not assert that those differences are fixed.
  for (const mutate of [
    array => array.splice(1, 2),
    array => array.splice(1),
    array => array.splice(1, Infinity),
    array => array.splice(1, 10000),
    array => { delete array[1] }
  ]) {
    const batches = []
    const state = PatchProxy({ items: [3, 1, 2, 4] }, patch => {
      const activePatch = structuredClone(patch)
      for (const entry of activePatch) entry.path.unshift('active')
      batches.push(activePatch)
    })
    mutate(state.items)
    assert.ok(batches.length > 0)
    for (const batch of batches) {
      const original = structuredClone(batch)
      assert.doesNotThrow(() => assertSessionPatchAllowed(batch))
      assert.deepEqual(batch, original)
    }
  }
})

test('root, protected metadata, and move/copy bypasses fail before persistence', async () => {
  const rejected = [
    ...[[], ['owner'], ['domain'], ['created'], ['owner', 'nested'], ['domain', 'nested'], ['created', 'nested']].map(path => change(path)),
    ...[["owner','status"], ["status','owner"], [String.raw`\u006fwner`]].map(path => change(path)),
    [{ op: 'move', from: ['active', 'value'], path: ['owner'] }],
    [{ op: 'move', from: ['active', 'items', 0], path: ['domain', 0] }],
    [{ op: 'move', from: ['active', 'items', 0], path: ['created', 0] }],
    [{ op: 'move', from: ['active', 'items', 0], path: [] }],
    [{ op: 'copy', from: ['active'], path: ['active', 'duplicate'] }],
    [{ op: 'replace', path: '/owner', value: 'other' }]
  ]
  for (const patch of rejected) {
    await assert.rejects(interact(domain, user, 'document', patch), /PROTECTED METADATA|INVALID PATCH/)
  }
  assert.equal(writes.length, 0)
})

test('session type creation and edits to legacy or core credential records are denied, including admins', async () => {
  for (const op of ['add', 'replace']) {
    await assert.rejects(interact(domain, user, 'document', change(['active_type'], SESSION_TYPE, op)), /READ ONLY/)
  }
  await saveSession(domain, session, sid, user, 'google', { name: 'Test user' })
  writes.length = 0
  for (const patch of [change(['active', 'user_id'], 'other'), change(['active'], {}), change(['active_type'], 'application/json'), change([])]) {
    await assert.rejects(interact(domain, user, session, patch), /READ ONLY/)
  }
  putState(environment.ADMIN_DOMAIN, session, {
    domain: environment.ADMIN_DOMAIN, owner: SESSION_OWNER, active_type: SESSION_TYPE, created: 1,
    active: { session_credential: 'admin-session', user_id: user, provider: 'google', sid_encrypted_info: '{}' }
  })
  await assert.rejects(interact(environment.ADMIN_DOMAIN, 'admin-user', session, change(['active'], {})), /READ ONLY/)
  putState(domain, 'legacy-session', {
    domain, owner: user, active_type: SESSION_TYPE, created: 1,
    active: { session_credential: 'legacy', user_id: user, provider: 'google', sid_encrypted_info: '{}' }
  })
  await assert.rejects(interact(domain, user, 'legacy-session', change(['active', 'provider'], 'other')), /READ ONLY/)
  assert.equal(writes.length, 0)
})

test('a mixed patch is validated completely before any application data is changed', async () => {
  await assert.rejects(interact(domain, user, 'document', [
    ...change(['active'], { valid: true }), ...change(['owner'], SESSION_OWNER)
  ]), /PROTECTED METADATA/)
  assert.equal(writes.length, 0)
  assert.equal((await getState(domain, 'document')).active, undefined)
})

test('saved credentials are core owned and authenticated sessions still reconnect', async () => {
  await saveSession(domain, session, sid, user, 'google', { name: 'Test user' })
  const saved = await getState(domain, session)
  assert.equal(saved.owner, 'core')
  assert.equal(saved.active.user_id, user)
  assert.equal(saved.active.session_credential, createHash('sha256').update(sid).digest('hex'))
  const reattached = await authenticate({ session }, domain, sid)
  assert.deepEqual(reattached, { user, provider: 'google', session, info: { name: 'Test user' } })
  const renewed = await authenticate({}, domain, sid)
  assert.equal(renewed.user, user)
  assert.equal(renewed.provider, 'google')
  assert.notEqual(renewed.session, session)
  assert.equal((await getState(domain, renewed.session)).owner, SESSION_OWNER)
  assert.equal(tokenCalls, 0)
})

test('core can update its existing domain configuration but cannot mutate credential sessions', async () => {
  putState('core', 'domain-config', {
    domain: 'core', owner: 'core', active_type: 'application/json', created: 1, ii: 0,
    active: { 'reports.test': { enabled: false } }
  })
  await interact('core', 'core', 'domain-config', change(['active', 'reports.test', 'enabled'], true))
  assert.equal((await getState('core', 'domain-config')).active['reports.test'].enabled, true)
  await saveSession('core', session, sid, user, 'google', {})
  const writeCount = writes.length
  await assert.rejects(interact('core', 'core', session, change(['active', 'user_id'], 'other-user')), /READ ONLY/)
  await assert.rejects(interact('core', 'core', session, change(['active_type'], 'application/json')), /READ ONLY/)
  assert.equal(writes.length, writeCount)
  assert.equal((await getState('core', session)).active.user_id, user)
})

test('both session lookup queries accept matching legacy owners but reject mismatches and stale types', async () => {
  await saveSession(domain, session, sid, user, 'google', {})
  for (const sql of [NEW_SESSION_QUERY, REATTACHING_SESSION_QUERY]) {
    const params = sql === NEW_SESSION_QUERY ? [await hash.create(sid)] : [await hash.create(sid), session]
    assert.equal((await query(domain, sql, params)).rows.length, 1)
    database(domain).prepare('UPDATE metadata SET owner = ? WHERE id = ?').run(user, session)
    assert.equal((await query(domain, sql, params)).rows.length, 1)
    database(domain).prepare('UPDATE metadata SET owner = ? WHERE id = ?').run('other-owner', session)
    assert.equal((await query(domain, sql, params)).rows.length, 0)
    database(domain).prepare('UPDATE metadata SET owner = ?, active_type = ? WHERE id = ?').run(SESSION_OWNER, 'application/json', session)
    assert.equal((await query(domain, sql, params)).rows.length, 0)
    database(domain).prepare('UPDATE metadata SET active_type = ? WHERE id = ?').run(SESSION_TYPE, session)
  }
})

test('legacy ordinary, anonymous, sub-user, and internal identities restore through both paths without migration', async () => {
  const identities = [
    [user, 'google'], [randomUUID(), 'anonymous'],
    [childUser, user], ['source-domain.test', 'core']
  ]
  for (const [identity, provider] of identities) {
    const legacySession = randomUUID(), browserSid = `sid-for-${identity}`
    const info = { name: `Existing ${provider} user` }
    putState(domain, legacySession, {
      domain, owner: identity, active_type: SESSION_TYPE, created: 1,
      active: { session_credential: createHash('sha256').update(browserSid).digest('hex'), user_id: identity, provider, sid_encrypted_info: JSON.stringify(info) }
    })
    const reattached = await authenticate({ session: legacySession }, domain, browserSid)
    assert.deepEqual(reattached, { user: identity, provider, session: legacySession, info })
    const renewed = await authenticate({}, domain, browserSid)
    assert.equal(renewed.user, identity)
    assert.equal(renewed.provider, provider)
    assert.deepEqual(renewed.info, info)
    assert.notEqual(renewed.session, legacySession)
    assert.equal((await getState(domain, renewed.session)).owner, SESSION_OWNER)
    assert.equal((await getState(domain, legacySession)).owner, identity, 'legacy records are not migrated')
  }
  assert.equal(tokenCalls, 0)
})

test('anonymous, ephemeral, and internal domain-agent login paths retain their behavior', async () => {
  const anonymous = await authenticate({ token: 'anonymous' }, domain, sid)
  assert.equal(anonymous.provider, 'anonymous')
  assert.equal((await getState(domain, anonymous.session)).owner, SESSION_OWNER)
  assert.equal((await authenticate({ session: anonymous.session }, domain, sid)).user, anonymous.user)
  const ephemeral = await authenticate({ token: 'anonymous-ephemeral' }, domain, sid)
  assert.equal(ephemeral.provider, 'anonymous')
  assert.equal(await getState(domain, ephemeral.session), null)
  await saveSession('domain-agent.test', session, 'internal-sid', 'source-domain.test', 'core', {})
  const internal = await authenticate({}, 'domain-agent.test', 'internal-sid')
  assert.equal(internal.user, 'source-domain.test')
  assert.equal(internal.provider, 'core')
})

test('credential writes refuse existing documents with the wrong owner or domain', async () => {
  await scopeToId(domain, user, session)
  await assert.rejects(saveSession(domain, session, sid, user, 'google', {}), /INVALID AUTHENTICATION SESSION OWNER/)
  putState(domain, session, { domain: 'foreign.test', owner: SESSION_OWNER, active_type: 'application/json', created: 1 })
  await assert.rejects(saveSession(domain, session, sid, user, 'google', {}), /INVALID AUTHENTICATION SESSION OWNER/)
  assert.equal(writes.length, 0)
})

test('sub-user code login keeps its owner checks and clients cannot forge credential ownership', async () => {
  putState('core', credentialId, {
    domain: 'core', owner: user, active_type: 'application/json', created: 1,
    active: { user: childUser, providerPublicKey: 'provider-public-key' }
  })
  putState('core', childUser, { domain: 'core', owner: user, active_type: 'application/json', created: 1 })
  const warning = console.warn
  console.warn = () => {}
  try {
    const result = await authenticateCodeToken(domain, 'a-valid-code-token-at-least-thirty-two-characters', 'JWT')
    assert.deepEqual(result, { user: childUser, provider_id: childUser, provider: user, info: { name: 'Child user' } })
    await assert.rejects(interact('core', user, credentialId, change(['owner'], 'other-owner')), /PROTECTED METADATA/)
    assert.equal((await getState('core', credentialId)).owner, user)
    assert.equal(writes.length, 0)
    // A mismatched pre-existing credential is rejected by the actual code-auth policy.
    states.get(stateKey('core', credentialId)).owner = 'other-owner'
    await assert.rejects(authenticateCodeToken(domain, 'a-valid-code-token-at-least-thirty-two-characters', 'JWT'))
  } finally { console.warn = warning }
})
