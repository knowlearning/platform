import authHtml from '../../sites/auth/index.html?raw'

const AUTH_ORIGIN = 'https://auth.knowlearning.systems'
const APP_ORIGIN = 'https://app.example'
const REFERRER = `${APP_ORIGIN}/lesson?private-referrer-token=example`
const ORIGINAL_STATE = 'pending-login-state'
const AUTH_CODE = 'provider-authorization-code'
const ERROR_STATE = 'c6d49240-2a68-4c98-898f-a3d656b34e45'
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
      values.delete(key)
    }
  }
}

async function runAuthPage({
  url,
  referrer = REFERRER,
  storage = createStorage(),
  blockedAccessor = false,
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

function expectCallback(page, { origin = APP_ORIGIN, provider = 'google' } = {}) {
  expect(page.error).to.equal(undefined)
  expect(page.agentLoads).to.equal(0)
  expect(page.errorElement.hidden).to.equal(true)
  expect(page.redirect.origin).to.equal(origin)
  expect(page.redirect.pathname).to.match(new RegExp(`^/auth/${ORIGINAL_STATE}/[^/]+$`))
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
    it('Preserves the existing localStorage flow when storage works', async function () {
      const storage = createStorage()
      const start = await startAuth({ storage })
      expect(start.error).to.equal(undefined)
      expect(start.agentLoads).to.equal(0)
      expect(start.errorElement.hidden).to.equal(true)
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
        expect(start.agentLoads).to.equal(0)
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
      expectReportedError(callback)
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
      const callback = await completeAuth(encodeFallback(), { encryptionError: new Error('Encryption failed') })
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
      const callback = await runAuthPage({ url, encryptionError })
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
