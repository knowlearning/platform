import authHtml from '../../sites/auth/index.html?raw'

const AUTH_ORIGIN = 'https://auth.knowlearning.systems'
const APP_ORIGIN = 'https://app.example'
const REFERRER = `${APP_ORIGIN}/lesson?private-referrer-token=example`
const ORIGINAL_STATE = 'pending-login-state'
const AUTH_CODE = 'provider-authorization-code'
const authScript = authHtml.match(/<script>([\s\S]*?)<\/script>/)[1]
const executeAuth = new Function('window', 'document', 'crypto', 'console', authScript)

function createStorage(failure) {
  const values = new Map()
  const removed = []
  return {
    values,
    removed,
    setItem(key, value) {
      if (failure === 'write') throw new Error('Storage writes blocked')
      if (failure !== 'silent') values.set(key, value)
    },
    getItem(key) {
      if (failure === 'read') throw new Error('Storage reads blocked')
      if (failure === 'mismatch') return 'unexpected stored value'
      return values.get(key) ?? null
    },
    removeItem(key) {
      removed.push(key)
      values.delete(key)
    }
  }
}

async function runAuthPage({ url, referrer = REFERRER, storage = createStorage(), blockedAccessor = false }) {
  const pageUrl = new URL(url)
  const result = { storage, payloads: [], warnings: [] }
  let encryptionStarted = false
  let finishNavigation
  const navigation = new Promise(resolve => { finishNavigation = resolve })
  const location = {
    pathname: pageUrl.pathname,
    origin: pageUrl.origin,
    search: pageUrl.search,
    get href() { return pageUrl.href },
    set href(value) {
      result.redirect = new URL(value, pageUrl)
      finishNavigation()
    }
  }
  const window = { location }
  Object.defineProperty(window, 'localStorage', {
    get() {
      if (blockedAccessor) throw new Error('Storage access blocked')
      return storage
    }
  })
  const crypto = {
    getRandomValues(bytes) { return bytes.fill(9) },
    subtle: {
      async importKey() {
        encryptionStarted = true
        return {}
      },
      async generateKey() { return {} },
      async exportKey() { return new Uint8Array([7]).buffer },
      async encrypt(algorithm, key, bytes) {
        if (algorithm.name === 'AES-GCM') {
          result.payloads.push(JSON.parse(new TextDecoder().decode(bytes)))
        }
        return new Uint8Array([1, 2, 3]).buffer
      }
    }
  }

  try {
    executeAuth(window, { referrer }, crypto, {
      warn(...messages) { result.warnings.push(messages) }
    })
  }
  catch (error) {
    result.error = error
  }

  if (encryptionStarted) {
    let timeoutId
    try {
      await Promise.race([
        navigation,
        new Promise((resolve, reject) => {
          timeoutId = setTimeout(() => reject(new Error('Auth callback did not redirect')), 1000)
        })
      ])
    }
    finally {
      clearTimeout(timeoutId)
    }
  }

  return result
}

function startAuth(options = {}) {
  const { provider = 'google', ...pageOptions } = options
  const ignoredRedirect = encodeURIComponent('https://ignored.example/destination')
  return runAuthPage({
    url: `${AUTH_ORIGIN}/${provider}/${ORIGINAL_STATE}/${ignoredRedirect}`,
    ...pageOptions
  })
}

function completeAuth(state, options = {}) {
  const query = new URLSearchParams({ state, code: AUTH_CODE })
  return runAuthPage({ url: `${AUTH_ORIGIN}/?${query}`, ...options })
}

function expectCallback(page, { origin = APP_ORIGIN, provider = 'google' } = {}) {
  expect(page.error).to.equal(undefined)
  expect(page.redirect.origin).to.equal(origin)
  expect(page.redirect.pathname).to.match(new RegExp(`^/auth/${ORIGINAL_STATE}/[^/]+$`))
  expect(page.payloads).to.deep.equal([{
    code: AUTH_CODE,
    provider,
    domain: new URL(origin).host
  }])
}

function encodeFallbackPayload(payload) {
  return 'KLAUTH1' + Array.from(
    new TextEncoder().encode(payload),
    byte => byte.toString(16).padStart(2, '0')
  ).join('')
}

function decodeFallbackPayload(state) {
  const bytes = Uint8Array.from(
    state.slice('KLAUTH1'.length).match(/.{2}/g),
    byte => Number.parseInt(byte, 16)
  )
  return new TextDecoder().decode(bytes)
}

function encodeFallback(overrides = {}) {
  return encodeFallbackPayload(JSON.stringify({
    state: ORIGINAL_STATE,
    origin: APP_ORIGIN,
    provider: 'google',
    ...overrides
  }))
}

export default function authRedirect() {
  describe('Auth redirect', function () {
    it('Preserves the existing localStorage flow when storage works', async function () {
      const storage = createStorage()
      const start = await startAuth({ storage })
      expect(start.error).to.equal(undefined)
      expect(storage.values.get(ORIGINAL_STATE)).to.equal(JSON.stringify({ origin: REFERRER, provider: 'google' }))
      expect(start.redirect.origin + start.redirect.pathname).to.equal('https://accounts.google.com/o/oauth2/auth')
      expect(start.redirect.searchParams.get('state')).to.equal(ORIGINAL_STATE)
      expect(start.redirect.searchParams.get('redirect_uri')).to.equal(`${AUTH_ORIGIN}/`)
      expect(start.redirect.searchParams.get('response_type')).to.equal('code')
      expect(start.redirect.searchParams.get('prompt')).to.equal('select_account')
      expect(start.redirect.searchParams.get('scope')).to.equal('openid profile')
      expect(start.redirect.searchParams.get('nonce')).to.be.a('string').and.not.equal('')

      const callback = await completeAuth(ORIGINAL_STATE, { storage })
      expectCallback(callback)
      expect(storage.values.has(ORIGINAL_STATE)).to.equal(false)
      expect(storage.removed).to.deep.equal([ORIGINAL_STATE])
    })

    for (const failure of ['accessor', 'write', 'read', 'silent', 'mismatch']) {
      it(`Roundtrips without callback storage after a storage ${failure} failure`, async function () {
        const start = await startAuth({
          storage: createStorage(failure),
          blockedAccessor: failure === 'accessor'
        })
        expect(start.error).to.equal(undefined)
        const state = start.redirect.searchParams.get('state')
        expect(state).not.to.equal(ORIGINAL_STATE)
        expect(decodeFallbackPayload(state)).not.to.include('private-referrer-token')

        const callback = await completeAuth(state, { blockedAccessor: true })
        expectCallback(callback)
      })
    }

    it('Uses fallback metadata when storage becomes available on callback', async function () {
      const start = await startAuth({ blockedAccessor: true })
      const state = start.redirect.searchParams.get('state')
      const storage = createStorage()
      storage.values.set(state, JSON.stringify({ origin: 'https://unexpected.example', provider: 'microsoft' }))

      expectCallback(await completeAuth(state, { storage }))
    })

    it('Rejects a missing legacy transaction instead of treating its nonce as fallback metadata', async function () {
      const callback = await completeAuth(ORIGINAL_STATE)
      expect(callback.error).to.be.instanceOf(Error)
      expect(callback.redirect).to.equal(undefined)
      expect(callback.payloads).to.deep.equal([])
    })

    for (const provider of ['google', 'microsoft', 'classlink', 'line', 'login.custom.example']) {
      it(`Preserves the ${provider} provider across fallback`, async function () {
        const start = await startAuth({ provider, blockedAccessor: true })
        expect(start.error).to.equal(undefined)
        const state = start.redirect.searchParams.get('state')
        expect(state).to.match(/^[a-zA-Z0-9]+$/)
        expectCallback(await completeAuth(state, { blockedAccessor: true }), { provider })
      })
    }

    for (const blockedAccessor of [false, true]) {
      it(`Preserves custom provider query parameters ${blockedAccessor ? 'with fallback' : 'with storage'}`, async function () {
        const start = await startAuth({ provider: 'login.custom.example', blockedAccessor })
        expect(start.error).to.equal(undefined)
        expect(start.redirect.origin).to.equal('https://login.custom.example')
        expect(start.redirect.searchParams.get('origin')).to.equal(REFERRER)
        expect(start.redirect.searchParams.get('redirect_uri')).to.equal(`${AUTH_ORIGIN}/`)
        expect(start.redirect.searchParams.get('response_type')).to.equal('code')
      })
    }

    for (const origin of ['https://app.example:8443', 'http://localhost:5112']) {
      it(`Supports the fallback destination ${origin}`, async function () {
        const start = await startAuth({ referrer: `${origin}/lesson`, blockedAccessor: true })
        expect(start.error).to.equal(undefined)
        const state = start.redirect.searchParams.get('state')
        expectCallback(await completeAuth(state, { blockedAccessor: true }), { origin })
      })
    }

    const invalidStates = [
      ['invalid hex encoding', 'KLAUTH1gg'],
      ['odd hex length', 'KLAUTH1abc'],
      ['invalid JSON', encodeFallbackPayload('not-json')],
      ['null metadata', encodeFallbackPayload('null')],
      ['missing nonce', encodeFallback({ state: undefined })],
      ['callback path injection', encodeFallback({ state: 'pending/other-path' })],
      ['empty provider', encodeFallback({ provider: '' })],
      ['non-string provider', encodeFallback({ provider: {} })],
      ['missing origin', encodeFallback({ origin: undefined })],
      ['invalid origin', encodeFallback({ origin: 'not-a-url' })],
      ['JavaScript origin', encodeFallback({ origin: 'javascript:alert(1)' })],
      ['data origin', encodeFallback({ origin: 'data:text/html,hello' })],
      ['file origin', encodeFallback({ origin: 'file:///tmp/auth' })],
      ['URL credentials', encodeFallback({ origin: 'https://user:password@app.example' })]
    ]

    for (const [description, state] of invalidStates) {
      it(`Rejects fallback ${description} without forwarding a credential`, async function () {
        const callback = await completeAuth(state, { blockedAccessor: true })
        expect(callback.error).to.be.instanceOf(Error)
        expect(callback.redirect).to.equal(undefined)
        expect(callback.payloads).to.deep.equal([])
      })
    }
  })
}
