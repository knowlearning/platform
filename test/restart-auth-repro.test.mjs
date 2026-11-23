import test from 'node:test'
import assert from 'node:assert/strict'
import { randomBytes, randomUUID, webcrypto } from 'node:crypto'
import { registerHooks } from 'node:module'
import { DatabaseSync } from 'node:sqlite'

test('a fresh internal connection credential creates a different session despite requesting the previous session', async context => {
  const database = new DatabaseSync(':memory:')
  context.after(() => database.close())
  database.exec(`
    CREATE TABLE sessions (id TEXT PRIMARY KEY, session_credential TEXT, user_id TEXT, provider TEXT, sid_encrypted_info TEXT);
    CREATE TABLE metadata (id TEXT PRIMARY KEY, domain TEXT, owner TEXT, active_type TEXT, created INTEGER);
  `)
  const records = new Map()
  const fixtureKey = Symbol.for('knowlearning.restart-auth-repro')
  const fixture = {
    environment: { ADMIN_DOMAIN: 'admin.test' },
    uuid: randomUUID,
    randomBytes: (count, encoding) => randomBytes(count).toString(encoding),
    isUUID: value => /^[0-9a-f-]{36}$/i.test(value),
    cryptoDigest: (algorithm, data) => webcrypto.subtle.digest(algorithm, data),
    encryptSymmetric: async (_key, value) => value,
    decryptSymmetric: async (_key, value) => value,
    async scopeToId(domain, owner, scope) {
      if (!records.has(scope)) records.set(scope, { domain, owner, created: Date.now() })
      return scope
    },
    async getState(_domain, id, { path }) {
      const record = records.get(id)
      return Object.fromEntries(path.map(key => [key, [record[key.slice(2)]]]))
    },
    async patchState(_domain, _user, _context, id, patch) {
      const record = records.get(id)
      for (const operation of patch) record[operation.path[0]] = operation.value
      database.prepare('INSERT OR REPLACE INTO metadata VALUES (?, ?, ?, ?, ?)')
        .run(id, record.domain, record.owner, record.active_type, record.created)
      database.prepare('INSERT OR REPLACE INTO sessions VALUES (?, ?, ?, ?, ?)')
        .run(id, record.active.session_credential, record.active.user_id, record.active.provider, record.active.sid_encrypted_info)
    },
    async query(_domain, sql, values) {
      const bindings = Object.fromEntries(values.map((value, index) => [`$${index + 1}`, value]))
      return { rows: database.prepare(sql).all(bindings) }
    }
  }
  globalThis[fixtureKey] = fixture
  context.after(() => delete globalThis[fixtureKey])
  const sourceRoot = new URL('../core/source/', import.meta.url)
  const expose = names => `const fixture = globalThis[Symbol.for('knowlearning.restart-auth-repro')];\n${names.map(name => `export const ${name} = fixture.${name};`).join('\n')}`
  const mocks = new Map()
  const mock = (path, source) => mocks.set(new URL(path, sourceRoot).href, source)
  mock('utils.js', `${expose(['environment', 'uuid', 'randomBytes', 'isUUID', 'cryptoDigest', 'encryptSymmetric', 'decryptSymmetric'])}\nexport const jwt = {}; export const jwkToPem = {};`)
  mock('persistence.js', expose(['getState', 'patchState']))
  mock('postgres.js', expose(['query']))
  mock('scope-to-id.js', `${expose(['scopeToId'])}\nexport default scopeToId;`)
  mock('side-effects/configure.js', 'export async function ensureDomainConfigured() {}')
  mock('interact.js', 'export default async function interact() { throw new Error("Unexpected ordinary interaction") }')
  mock('authenticate/authenticate-token.js', 'export default async function authenticateToken() { throw new Error("Unexpected token authentication") }')
  const hooks = registerHooks({
    load(url, loadContext, nextLoad) {
      return mocks.has(url)
        ? { format: 'module', source: mocks.get(url), shortCircuit: true }
        : nextLoad(url, loadContext)
    }
  })
  context.after(() => hooks.deregister())
  const { default: createSession } = await import('../core/source/domain-agent/create-session.js')
  const { default: authenticate } = await import('../core/source/authenticate/index.js')
  const domain = 'target.test'
  const identity = 'source-agent.test'
  const originalCredential = await createSession(domain, identity)
  const original = await authenticate({}, domain, originalCredential)
  const reattached = await authenticate({ session: original.session }, domain, originalCredential)
  assert.equal(reattached.session, original.session)
  const replacementCredential = await createSession(domain, identity)
  assert.notEqual(replacementCredential, originalCredential)
  const replacement = await authenticate({ session: original.session }, domain, replacementCredential)
  assert.notEqual(replacement.session, original.session)
  assert.equal(replacement.user, original.user)
  assert.equal(replacement.provider, 'core')
  context.diagnostic('Real credential creation, authentication, credential hashing, session persistence writer, and session SQL: stable credential reattaches; replacement credential creates a new session for the same internal user.')
})
