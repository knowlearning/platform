import authHtml from '../../sites/auth/index.html?raw'

const AUTH_ORIGIN = 'https://auth.knowlearning.systems'
const APP_ORIGIN = 'https://app.example'
const REFERRER = `${APP_ORIGIN}/lesson?private-referrer-token=example`
const ORIGINAL_STATE = 'pending-login-state'
const AUTH_CODE = 'provider-authorization-code'
const ERROR_STATE = 'c6d49240-2a68-4c98-898f-a3d656b34e45'
const CHROME_NAVIGATOR = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36',
  vendor: 'Google Inc.',
  platform: 'MacIntel',
  maxTouchPoints: 0
}
const SAFARI_NAVIGATOR = {
  userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Safari/605.1.15',
  vendor: 'Apple Computer, Inc.',
  platform: 'MacIntel',
  maxTouchPoints: 0
}
const IOS_NAVIGATOR = {
  userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.6 Mobile/15E148 Safari/604.1',
  vendor: 'Apple Computer, Inc.',
  platform: 'iPhone',
  maxTouchPoints: 5
}
const authScript = authHtml.match(/<script>([\s\S]*?)<\/script>/)[1]
const executeAuth = new Function('window', 'document', 'crypto', 'console', 'loadAgents', 'setTimeout', 'clearTimeout', authScript
  .replace('import(agentsUrl)', 'loadAgents()')
  .replace('runAuth().catch(reportError)', 'window.reportError = reportError; return runAuth().catch(reportError)'))

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
      if (failure === 'remove') throw new Error('Storage removal blocked')
      values.delete(key)
    }
  }
}

async function runAuthPage({
  url,
  referrer = REFERRER,
  storage = createStorage(),
  blockedAccessor = false,
  navigator = CHROME_NAVIGATOR,
  encryptionError,
  loadError,
  initializeError,
  writeError,
  receipt = { ii: 0 },
  pendingImport = false,
  pendingWrite = false,
  timeoutMs
}) {
  const pageUrl = new URL(url)
  let errorText = ''
  let finishReport
  const reportComplete = new Promise(resolve => { finishReport = resolve })
  const errorElement = {
    hidden: true,
    get textContent() { return errorText },
    set textContent(value) {
      errorText = value
      if (value !== 'Error: reporting…') finishReport()
    }
  }
  const listeners = {}
  const result = { storage, errorElement, reportComplete, listeners, payloads: [], warnings: [], agentLoads: 0, initializations: 0, writes: [], disconnects: 0 }
  const location = {
    pathname: pageUrl.pathname,
    origin: pageUrl.origin,
    search: pageUrl.search,
    get href() { return pageUrl.href },
    set href(value) {
      result.redirect = new URL(value, pageUrl)
    }
  }
  const window = {
    location,
    navigator,
    addEventListener(type, handler) { listeners[type] = handler }
  }
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
        if (encryptionError) throw encryptionError
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
  const agent = {
    uuid() { return ERROR_STATE },
    async interact(id, patches) {
      result.writes.push({ id, patches })
      if (writeError) throw writeError
      if (pendingWrite) return new Promise(resolve => { result.finishWrite = resolve })
      return receipt
    },
    disconnect() { result.disconnects += 1 }
  }
  async function loadAgents() {
    result.agentLoads += 1
    if (loadError) throw loadError
    if (pendingImport) await new Promise(resolve => { result.finishImport = resolve })
    return {
      default() {
        result.initializations += 1
        if (initializeError) throw initializeError
        return agent
      }
    }
  }
  const document = {
    referrer,
    getElementById(id) {
      expect(id).to.equal('error')
      return errorElement
    }
  }

  try {
    await executeAuth(window, document, crypto, {
      warn(...messages) { result.warnings.push(messages) }
    }, loadAgents, (callback, delay) => setTimeout(callback, timeoutMs ?? delay), clearTimeout)
  }
  catch (error) {
    result.error = error
  }

  result.reportError = window.reportError
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

function expectCallback(page, { origin = APP_ORIGIN, provider = 'google', state = ORIGINAL_STATE } = {}) {
  expect(page.error).to.equal(undefined)
  expect(page.agentLoads).to.equal(0)
  expect(page.errorElement.hidden).to.equal(true)
  expect(page.redirect.origin).to.equal(origin)
  expect(page.redirect.pathname).to.match(new RegExp(`^/auth/${state}/[^/]+$`))
  expect(page.payloads).to.deep.equal([{
    code: AUTH_CODE,
    provider,
    domain: new URL(origin).host
  }])
}

function expectReportedError(page) {
  expect(page.error).to.equal(undefined)
  expect(page.redirect).to.equal(undefined)
  expect(page.agentLoads).to.equal(1)
  expect(page.errorElement.hidden).to.equal(false)
  expect(page.errorElement.textContent).to.equal(`Error: ${ERROR_STATE}`)
  expect(page.writes).to.have.length(1)
  expect(page.writes[0].id).to.equal(ERROR_STATE)
  expect(page.writes[0].patches[0]).to.deep.equal({ op: 'add', path: ['active_type'], value: 'application/json' })
  const reportPatch = page.writes[0].patches[1]
  expect(reportPatch.op).to.equal('add')
  expect(reportPatch.path).to.deep.equal(['active'])
  const report = reportPatch.value
  expect(report.type).to.equal('auth-error')
  expect(report.name).to.be.a('string').and.not.equal('')
  expect(report.message).to.be.a('string').and.not.equal('')
  expect(report.stack).to.be.a('string')
  expect(new Date(report.timestamp).toISOString()).to.equal(report.timestamp)
  expect(page.disconnects).to.equal(1)
  return report
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
    it('Always encodes provider state while preserving the localStorage flow', async function () {
      const storage = createStorage()
      const start = await startAuth({ storage })
      expect(start.error).to.equal(undefined)
      expect(start.agentLoads).to.equal(0)
      expect(start.errorElement.hidden).to.equal(true)
      expect(storage.values.get(ORIGINAL_STATE)).to.equal(JSON.stringify({ origin: REFERRER, provider: 'google' }))
      expect(start.redirect.origin + start.redirect.pathname).to.equal('https://accounts.google.com/o/oauth2/auth')
      const state = start.redirect.searchParams.get('state')
      expect(JSON.parse(decodeFallbackPayload(state))).to.deep.equal({
        state: ORIGINAL_STATE,
        origin: APP_ORIGIN,
        provider: 'google'
      })
      expect(decodeFallbackPayload(state)).not.to.include('private-referrer-token')
      expect(start.redirect.searchParams.get('redirect_uri')).to.equal(`${AUTH_ORIGIN}/`)
      expect(start.redirect.searchParams.get('response_type')).to.equal('code')
      expect(start.redirect.searchParams.get('prompt')).to.equal('select_account')
      expect(start.redirect.searchParams.get('scope')).to.equal('openid profile')
      expect(start.redirect.searchParams.get('nonce')).to.be.a('string').and.not.equal('')

      const callback = await completeAuth(state, { storage })
      expectCallback(callback)
      expect(storage.values.has(ORIGINAL_STATE)).to.equal(false)
      expect(storage.removed).to.deep.equal([ORIGINAL_STATE])
    })

    it('Accepts existing raw nonce callbacks when their stored transaction is available', async function () {
      const storage = createStorage()
      storage.values.set(ORIGINAL_STATE, JSON.stringify({ origin: REFERRER, provider: 'google' }))
      expectCallback(await completeAuth(ORIGINAL_STATE, { storage }))
      expect(storage.removed).to.deep.equal([ORIGINAL_STATE])
    })

    for (const failure of ['accessor', 'write', 'read', 'silent', 'mismatch']) {
      it(`Roundtrips on iOS without callback storage after a storage ${failure} failure`, async function () {
        const start = await startAuth({
          storage: createStorage(failure),
          blockedAccessor: failure === 'accessor',
          navigator: IOS_NAVIGATOR
        })
        expect(start.error).to.equal(undefined)
        expect(start.agentLoads).to.equal(0)
        const state = start.redirect.searchParams.get('state')
        expect(state).not.to.equal(ORIGINAL_STATE)
        expect(decodeFallbackPayload(state)).not.to.include('private-referrer-token')

        const callback = await completeAuth(state, { blockedAccessor: true, navigator: IOS_NAVIGATOR })
        expectCallback(callback)
      })

      it(`Reports a storage ${failure} failure before leaving a non-Safari desktop browser`, async function () {
        const start = await startAuth({ storage: createStorage(failure), blockedAccessor: failure === 'accessor' })
        const report = expectReportedError(start)
        expect(report.stage).to.equal('storage')
        expect(start.payloads).to.deep.equal([])
      })
    }

    it('Recovers on iOS when storage is cleared between the provider redirect and callback', async function () {
      const storage = createStorage()
      const start = await startAuth({ storage, navigator: IOS_NAVIGATOR })
      expect(storage.values.has(ORIGINAL_STATE)).to.equal(true)
      storage.values.clear()
      expectCallback(await completeAuth(start.redirect.searchParams.get('state'), { storage, navigator: IOS_NAVIGATOR }))
    })

    it('Reports lost callback storage on a non-Safari desktop browser', async function () {
      const storage = createStorage()
      const start = await startAuth({ storage })
      storage.values.clear()
      const callback = await completeAuth(start.redirect.searchParams.get('state'), { storage })
      expectReportedError(callback)
      expect(callback.payloads).to.deep.equal([])
    })

    it('Uses available stored metadata instead of conflicting encoded metadata on Safari', async function () {
      const storage = createStorage()
      storage.values.set(ORIGINAL_STATE, JSON.stringify({ origin: REFERRER, provider: 'google' }))
      const state = encodeFallback({ origin: 'https://unexpected.example', provider: 'microsoft' })
      expectCallback(await completeAuth(state, { storage, navigator: SAFARI_NAVIGATOR }))
      expect(storage.removed).to.deep.equal([ORIGINAL_STATE])
    })

    it('Keeps successfully read transaction metadata when cleanup fails', async function () {
      const storage = createStorage('remove')
      storage.values.set(ORIGINAL_STATE, JSON.stringify({ origin: REFERRER, provider: 'google' }))
      const state = encodeFallback({ origin: 'https://unexpected.example', provider: 'microsoft' })
      expectCallback(await completeAuth(state, { storage }))
      expect(storage.values.has(ORIGINAL_STATE)).to.equal(true)
      expect(storage.removed).to.deep.equal([ORIGINAL_STATE])
    })

    it('Does not delete unrelated storage when its key is supplied as the encoded nonce', async function () {
      const storage = createStorage()
      storage.values.set('API_HOST', 'api.example')
      const callback = await completeAuth(encodeFallback({ state: 'API_HOST' }), { storage, navigator: SAFARI_NAVIGATOR })
      expectCallback(callback, { state: 'API_HOST' })
      expect(storage.values.get('API_HOST')).to.equal('api.example')
      expect(storage.removed).to.deep.equal([])
    })

    it('Does not remove stored data when recovery follows a storage read failure', async function () {
      const storage = createStorage('read')
      const storedInfo = JSON.stringify({ origin: REFERRER, provider: 'google' })
      storage.values.set(ORIGINAL_STATE, storedInfo)
      expectCallback(await completeAuth(encodeFallback(), { storage, navigator: SAFARI_NAVIGATOR }))
      expect(storage.values.get(ORIGINAL_STATE)).to.equal(storedInfo)
      expect(storage.removed).to.deep.equal([])
    })

    it('Looks up the original nonce when storage becomes available on callback', async function () {
      const start = await startAuth({ blockedAccessor: true, navigator: IOS_NAVIGATOR })
      const state = start.redirect.searchParams.get('state')
      const storage = createStorage()
      storage.values.set(state, JSON.stringify({ origin: 'https://unexpected.example', provider: 'microsoft' }))

      expectCallback(await completeAuth(state, { storage, navigator: IOS_NAVIGATOR }))
    })

    for (const navigator of [CHROME_NAVIGATOR, IOS_NAVIGATOR]) {
      it(`Rejects a missing legacy transaction on ${navigator.platform} instead of treating its nonce as metadata`, async function () {
        const callback = await completeAuth(ORIGINAL_STATE, { navigator })
        expectReportedError(callback)
        expect(callback.payloads).to.deep.equal([])
      })
    }

    for (const navigator of [CHROME_NAVIGATOR, SAFARI_NAVIGATOR]) {
      for (const failure of ['read', 'accessor']) {
        it(`${navigator === SAFARI_NAVIGATOR ? 'Recovers' : 'Reports'} a callback storage ${failure} failure on ${navigator.vendor}`, async function () {
          const callback = await completeAuth(encodeFallback(), {
            storage: createStorage(failure),
            blockedAccessor: failure === 'accessor',
            navigator
          })
          if (navigator === SAFARI_NAVIGATOR) expectCallback(callback)
          else {
            expectReportedError(callback)
            expect(callback.payloads).to.deep.equal([])
          }
        })
      }
      for (const storedInfo of ['not-json', 'null', '{}']) {
        it(`${navigator === SAFARI_NAVIGATOR ? 'Recovers' : 'Reports'} invalid stored metadata ${storedInfo} on ${navigator.vendor}`, async function () {
          const storage = createStorage()
          storage.values.set(ORIGINAL_STATE, storedInfo)
          const callback = await completeAuth(encodeFallback(), { storage, navigator })
          if (navigator === SAFARI_NAVIGATOR) expectCallback(callback)
          else {
            expectReportedError(callback)
            expect(callback.payloads).to.deep.equal([])
          }
        })
      }
    }

    for (const provider of ['google', 'microsoft', 'classlink', 'line', 'login.custom.example']) {
      it(`Preserves the ${provider} provider across fallback`, async function () {
        const start = await startAuth({ provider, blockedAccessor: true, navigator: IOS_NAVIGATOR })
        expect(start.error).to.equal(undefined)
        const state = start.redirect.searchParams.get('state')
        expect(state).to.match(/^[a-zA-Z0-9]+$/)
        expectCallback(await completeAuth(state, { blockedAccessor: true, navigator: IOS_NAVIGATOR }), { provider })
      })
    }

    for (const blockedAccessor of [false, true]) {
      it(`Preserves custom provider query parameters ${blockedAccessor ? 'with fallback' : 'with storage'}`, async function () {
        const start = await startAuth({ provider: 'login.custom.example', blockedAccessor, navigator: IOS_NAVIGATOR })
        expect(start.error).to.equal(undefined)
        expect(start.redirect.origin).to.equal('https://login.custom.example')
        expect(start.redirect.searchParams.get('origin')).to.equal(REFERRER)
        expect(start.redirect.searchParams.get('redirect_uri')).to.equal(`${AUTH_ORIGIN}/`)
        expect(start.redirect.searchParams.get('response_type')).to.equal('code')
      })
    }

    for (const origin of ['https://app.example:8443', 'http://localhost:5112']) {
      it(`Supports the fallback destination ${origin}`, async function () {
        const start = await startAuth({ referrer: `${origin}/lesson`, blockedAccessor: true, navigator: IOS_NAVIGATOR })
        expect(start.error).to.equal(undefined)
        const state = start.redirect.searchParams.get('state')
        expectCallback(await completeAuth(state, { blockedAccessor: true, navigator: IOS_NAVIGATOR }), { origin })
      })
    }

    const browserCases = [
      ['iPhone Safari', IOS_NAVIGATOR, true],
      ['iPad Safari', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replaceAll('iPhone', 'iPad'),
        platform: 'iPad'
      }, true],
      ['iPod Safari', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replaceAll('iPhone', 'iPod'),
        platform: 'iPod'
      }, true],
      ['iOS Chrome', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replace('Version/18.6', 'CriOS/140.0.7339.39')
      }, true],
      ['iOS Firefox', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replace('Version/18.6', 'FxiOS/142.0')
      }, true],
      ['iOS Edge', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replace('Version/18.6', 'EdgiOS/140.0.3485.54')
      }, true],
      ['iOS webview without Safari token', {
        ...IOS_NAVIGATOR,
        userAgent: IOS_NAVIGATOR.userAgent.replace(' Version/18.6', '').replace(' Safari/604.1', '')
      }, true],
      ['desktop-mode iPad', { ...SAFARI_NAVIGATOR, maxTouchPoints: 5 }, true],
      ['desktop-mode iPad with Macintosh user agent', {
        ...SAFARI_NAVIGATOR,
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15',
        platform: '',
        maxTouchPoints: 5
      }, true],
      ['desktop-mode iPad with MacIntel platform', {
        ...SAFARI_NAVIGATOR,
        userAgent: 'Mozilla/5.0 AppleWebKit/605.1.15',
        maxTouchPoints: 5
      }, true],
      ['macOS Safari', SAFARI_NAVIGATOR, true],
      ['macOS Chrome', CHROME_NAVIGATOR, false],
      ['macOS Edge', {
        ...CHROME_NAVIGATOR,
        userAgent: `${CHROME_NAVIGATOR.userAgent} Edg/140.0.3485.54`
      }, false],
      ['macOS Firefox', {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:142.0) Gecko/20100101 Firefox/142.0',
        vendor: '',
        platform: 'MacIntel',
        maxTouchPoints: 0
      }, false],
      ['Android Chrome', {
        ...CHROME_NAVIGATOR,
        userAgent: 'Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      }, false],
      ['Android browser with Apple vendor', {
        ...SAFARI_NAVIGATOR,
        userAgent: 'Mozilla/5.0 (Linux; Android 15) AppleWebKit/537.36 (KHTML, like Gecko) Version/18.6 Mobile Safari/537.36',
        platform: 'Linux armv8l',
        maxTouchPoints: 5
      }, false],
      ['unknown browser', { userAgent: '', vendor: '', platform: '', maxTouchPoints: 0 }, false]
    ]

    for (const [browser, navigator, supportsRecovery] of browserCases) {
      it(`${supportsRecovery ? 'Allows' : 'Rejects'} storage recovery on ${browser}`, async function () {
        const start = await startAuth({ navigator, blockedAccessor: true })
        const callback = await completeAuth(encodeFallback(), { navigator })
        if (supportsRecovery) {
          expect(start.error).to.equal(undefined)
          expect(start.agentLoads).to.equal(0)
          expect(JSON.parse(decodeFallbackPayload(start.redirect.searchParams.get('state')))).to.deep.equal({
            state: ORIGINAL_STATE,
            origin: APP_ORIGIN,
            provider: 'google'
          })
          expectCallback(callback)
        }
        else {
          expectReportedError(start)
          expectReportedError(callback)
          expect(callback.payloads).to.deep.equal([])
        }
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
        const callback = await completeAuth(state, { blockedAccessor: true, navigator: IOS_NAVIGATOR })
        expectReportedError(callback)
        expect(callback.payloads).to.deep.equal([])
      })
    }

    it('Reports a storage access error during a legacy callback', async function () {
      const callback = await completeAuth(ORIGINAL_STATE, { blockedAccessor: true })
      const report = expectReportedError(callback)
      expect(report.stage).to.equal('storage')
      expect(report.message).to.include('Storage access blocked')
      expect(callback.payloads).to.deep.equal([])
    })

    it('Reports rejected encryption instead of leaving the auth screen blank', async function () {
      const callback = await completeAuth(encodeFallback(), { encryptionError: new Error('Encryption failed'), navigator: IOS_NAVIGATOR })
      const report = expectReportedError(callback)
      expect(report.stage).to.equal('encryption')
      expect(report.provider).to.equal('google')
      expect(report.message).to.equal('Encryption failed')
    })

    it('Reports OAuth denial without saving its description or callback parameters', async function () {
      const query = new URLSearchParams({
        error: 'access_denied',
        error_description: 'private-provider-description',
        state: encodeFallback(),
        access_token: 'private-access-token'
      })
      const callback = await runAuthPage({ url: `${AUTH_ORIGIN}/?${query}` })
      const report = expectReportedError(callback)
      expect(report.stage).to.equal('callback')
      expect(report.message).to.include('access_denied')
      expect(JSON.stringify(report)).not.to.include('private-provider-description')
      expect(JSON.stringify(report)).not.to.include('private-access-token')
      expect(callback.payloads).to.deep.equal([])
    })

    it('Reports an incomplete callback but leaves a bare auth visit idle', async function () {
      expectReportedError(await runAuthPage({ url: `${AUTH_ORIGIN}/?code=${AUTH_CODE}` }))
      const emptyPage = await runAuthPage({ url: `${AUTH_ORIGIN}/` })
      expect(emptyPage.agentLoads).to.equal(0)
      expect(emptyPage.errorElement.hidden).to.equal(true)
    })

    it('Redacts credentials and URLs from error messages and stacks', async function () {
      const state = encodeFallback()
      const url = `${AUTH_ORIGIN}/?${new URLSearchParams({ state, code: AUTH_CODE, access_token: 'private-access-token' })}`
      const encryptionError = new Error(`Encryption failed for ${AUTH_CODE} and private-access-token at ${url} from ${REFERRER}`)
      encryptionError.stack = `Error: ${encryptionError.message}\n    at encrypt (${url}:1:2)`
      const callback = await runAuthPage({ url, encryptionError, navigator: IOS_NAVIGATOR })
      const report = expectReportedError(callback)
      const serialized = JSON.stringify(report)
      for (const secret of [AUTH_CODE, state, 'private-access-token', 'private-referrer-token', url, REFERRER]) {
        expect(serialized).not.to.include(secret)
      }
      expect(report.message).to.include('Encryption failed')
    })

    const reportingFailures = [
      ['module loading', { loadError: new Error('Unable to load agents') }],
      ['agent initialization', { initializeError: new Error('Agent unavailable') }],
      ['state saving', { writeError: new Error('Unable to save state') }],
      ['missing save receipt', { receipt: {} }],
      ['empty save receipt', { receipt: null }],
      ['null interaction index', { receipt: { ii: null } }],
      ['non-numeric interaction index', { receipt: { ii: 'saved-interaction' } }],
      ['negative interaction index', { receipt: { ii: -1 } }],
      ['fractional interaction index', { receipt: { ii: 0.5 } }],
      ['module loading timeout', { pendingImport: true, timeoutMs: 0 }],
      ['state saving timeout', { pendingWrite: true, timeoutMs: 0 }]
    ]

    for (const [failure, options] of reportingFailures) {
      it(`Shows a fallback when ${failure} fails`, async function () {
        const callback = await completeAuth(encodeFallback(), {
          encryptionError: new Error('Encryption failed'),
          navigator: IOS_NAVIGATOR,
          ...options
        })
        expect(callback.error).to.equal(undefined)
        expect(callback.redirect).to.equal(undefined)
        expect(callback.agentLoads).to.equal(1)
        expect(callback.errorElement.hidden).to.equal(false)
        expect(callback.errorElement.textContent).to.equal('Error: report unavailable')
      })
    }

    it('Keeps the fallback visible when a timed-out save later succeeds', async function () {
      const callback = await completeAuth(encodeFallback(), {
        encryptionError: new Error('Encryption failed'),
        navigator: IOS_NAVIGATOR,
        pendingWrite: true,
        timeoutMs: 0
      })
      callback.finishWrite({ ii: 1 })
      await Promise.resolve()
      await Promise.resolve()
      expect(callback.errorElement.textContent).to.equal('Error: report unavailable')
      expect(callback.writes).to.have.length(1)
    })

    it('Skips agent initialization when a timed-out module import later succeeds', async function () {
      const callback = await completeAuth(encodeFallback(), {
        encryptionError: new Error('Encryption failed'),
        navigator: IOS_NAVIGATOR,
        pendingImport: true,
        timeoutMs: 0
      })
      callback.finishImport()
      await Promise.resolve()
      await Promise.resolve()
      expect(callback.errorElement.textContent).to.equal('Error: report unavailable')
      expect(callback.initializations).to.equal(0)
      expect(callback.writes).to.deep.equal([])
    })

    it('Handles global errors and unhandled rejections with one report', async function () {
      const page = await runAuthPage({ url: `${AUTH_ORIGIN}/` })
      page.listeners.error({ error: new Error('Unexpected auth error'), preventDefault() {} })
      page.listeners.unhandledrejection({ reason: new Error('Another auth error'), preventDefault() {} })
      await page.reportError(new Error('Duplicate auth error'))
      await page.reportComplete
      const report = expectReportedError(page)
      expect(report.message).to.equal('Unexpected auth error')
    })
  })
}
