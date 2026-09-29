import storageSource from '../../packages/agents/agents/browser/storage.js?raw'
import rootSource from '../../packages/agents/agents/browser/root.js?raw'
import authSource from '../../packages/agents/agents/browser/auth.js?raw'

function createPage(failure, pathname = '/') {
  const values = new Map()
  const page = {
    failure,
    values,
    reloads: 0,
    warnings: [],
    location: {
      pathname,
      host: 'app.example',
      href: `https://app.example${pathname}`,
      reload() { page.reloads += 1 }
    }
  }
  const persistentStorage = {
    getItem(key) {
      if (page.failure === 'read') throw new Error('Storage reads blocked')
      return values.get(key) ?? null
    },
    setItem(key, value) {
      if (page.failure === 'write') throw new Error('Storage writes blocked')
      if (page.failure !== 'silent-write') values.set(key, String(value))
    },
    removeItem(key) {
      if (page.failure === 'remove') throw new Error('Storage removal blocked')
      if (page.failure !== 'silent-remove') values.delete(key)
    }
  }
  Object.defineProperty(page, 'localStorage', {
    get() {
      if (page.failure === 'accessor') throw new Error('Storage access blocked')
      return persistentStorage
    }
  })
  page.console = { warn(...messages) { page.warnings.push(messages) }, log() {} }
  return page
}

function loadStorage(page) {
  return new Function('window', storageSource.replace('export default', 'return'))(page)
}

function loadAuth(page, storage) {
  const source = authSource
    .replace(/^import .*$/gm, '')
    .replace(/export\s*\{[\s\S]*?\}/, 'return { getToken, login, logout }')
  return new Function('window', 'storage', 'console', source)(page, storage, page.console)
}

async function loadRoot(page, storage, {
  status = 201,
  sid = 'session-id',
  options = {},
  ready = Promise.resolve(),
  fetchError
} = {}) {
  const sockets = []
  const requests = []
  let agentOptions
  const auth = loadAuth(page, storage)
  const source = rootSource
    .replace(/^import .*$/gm, '')
    .replace('export default', 'return')
  const createAgent = new Function(
    'window', 'location', 'navigator', 'console', 'storage', 'fetch',
    'io', 'GenericAgent', 'getToken', 'login', 'logout', 'uuid', 'applyPatch', source
  )(
    page, page.location, { languages: ['en'] }, page.console, storage,
    async (url, init) => {
      requests.push({ url, init })
      await ready
      if (fetchError) throw fetchError
      return { status, async text() { return sid } }
    },
    (url, settings) => {
      const handlers = {}
      const socket = { url, settings, handlers, messages: [] }
      sockets.push(socket)
      return {
        on(event, callback) { handlers[event] = callback },
        emit(event, message) { socket.messages.push({ event, message }) },
        disconnect() {}
      }
    },
    settings => {
      agentOptions = settings
      return { connection: new settings.Connection() }
    },
    auth.getToken, auth.login, auth.logout, () => 'generated-id', () => {}
  )
  const agent = createAgent(options)
  await new Promise(resolve => setTimeout(resolve, 0))
  return { agent, agentOptions, sockets, requests }
}

export default function browserStorage() {
  describe('Browser storage guards', function () {
    it('Preserves persistent reads, writes, and removals when storage works', function () {
      const page = createPage()
      page.values.set('existing', 'stored-value')
      const storage = loadStorage(page)
      expect(storage.getItem('existing')).to.equal('stored-value')
      expect(storage.setItem('new', 'new-value')).to.equal(true)
      expect(page.values.get('new')).to.equal('new-value')
      expect(storage.removeItem('existing')).to.equal(true)
      expect(page.values.has('existing')).to.equal(false)
      expect(storage.getItem('existing')).to.equal(null)
    })

    for (const failure of ['accessor', 'read', 'write', 'silent-write']) {
      it(`Reports failed persistence after a storage ${failure} failure`, function () {
        const page = createPage(failure)
        const storage = loadStorage(page)
        expect(storage.getItem('sid')).to.equal(null)
        expect(storage.setItem('sid', 'memory-session')).to.equal(false)
        expect(storage.getItem('sid')).to.equal(null)
      })
    }

    for (const failure of ['accessor', 'read', 'remove', 'silent-remove']) {
      it(`Handles token access without throwing after a storage ${failure} failure`, async function () {
        const page = createPage(failure)
        page.values.set('token', 'one-use-token')
        const storage = loadStorage(page)
        const auth = loadAuth(page, storage)
        const token = await auth.getToken()
        expect(token).to.equal(null)
        expect(await auth.getToken()).to.equal(null)
        expect(page.values.get('token')).to.equal('one-use-token')
      })
    }

    for (const failure of ['accessor', 'read', 'remove', 'silent-remove']) {
      it(`Reports failed removal after a storage ${failure} failure`, function () {
        const page = createPage(failure)
        page.values.set('sid', 'existing-session')
        const storage = loadStorage(page)
        expect(storage.removeItem('sid')).to.equal(false)
      })
    }

    for (const failure of ['accessor', 'read', 'write', 'silent-write']) {
      it(`Connects the default agent with an in-memory SID after a storage ${failure} failure`, async function () {
        const page = createPage(failure)
        const storage = loadStorage(page)
        const first = await loadRoot(page, storage)
        expect(first.requests[0].url).to.equal('https://socket-io.knowlearning.systems/_sid-check')
        expect(first.sockets).to.have.length(1)
        expect(await first.agentOptions.sid()).to.equal('session-id')
        first.agent.connection.send({ type: 'test' })
        expect(first.sockets[0].messages).to.deep.equal([{ event: 'message', message: { type: 'test' } }])
        new first.agentOptions.Connection()
        await new Promise(resolve => setTimeout(resolve, 0))
        expect(first.sockets).to.have.length(2)
        expect(first.sockets[1].settings.extraHeaders).to.deep.equal({ sid: 'session-id' })
        expect(await first.agentOptions.sid()).to.equal('session-id')
        expect(page.reloads).to.equal(0)
      })
    }

    it('Uses the configured API host and preserves normal SID reload behavior', async function () {
      const page = createPage()
      page.values.set('API_HOST', 'api.example')
      const storage = loadStorage(page)
      const result = await loadRoot(page, storage)
      expect(result.requests[0].url).to.equal('https://api.example/_sid-check')
      expect(page.values.get('sid')).to.equal('session-id')
      expect(page.reloads).to.equal(1)
    })

    it('Waits for the SID before providing authentication session data', async function () {
      const page = createPage('accessor')
      let finishCheck
      const ready = new Promise(resolve => { finishCheck = resolve })
      const result = await loadRoot(page, loadStorage(page), { ready })
      let authenticated = false
      const authentication = result.agentOptions.sid().then(sid => {
        authenticated = true
        return sid
      })
      await Promise.resolve()
      expect(authenticated).to.equal(false)
      finishCheck()
      expect(await authentication).to.equal('session-id')
      expect(page.reloads).to.equal(0)
    })

    it('Preserves an existing session when the SID check fails', async function () {
      const page = createPage()
      page.values.set('sid:api.example', 'existing-session')
      const result = await loadRoot(page, loadStorage(page), {
        options: { apiHost: 'api.example' },
        fetchError: new Error('Network unavailable')
      })
      expect(await result.agentOptions.sid()).to.equal('existing-session')
      expect(result.sockets[0].settings.extraHeaders).to.deep.equal({ sid: 'existing-session' })
      expect(page.reloads).to.equal(0)
    })

    it('Keeps explicit API host sessions separate without requiring storage', async function () {
      const page = createPage('accessor')
      const storage = loadStorage(page)
      const first = await loadRoot(page, storage, { options: { apiHost: 'first.example' }, sid: 'first-session' })
      const second = await loadRoot(page, storage, { options: { apiHost: 'second.example' }, sid: 'second-session' })
      expect(await first.agentOptions.sid()).to.equal('first-session')
      expect(await second.agentOptions.sid()).to.equal('second-session')
      expect(first.sockets[0].settings.extraHeaders).to.deep.equal({ sid: 'first-session' })
      expect(second.sockets[0].settings.extraHeaders).to.deep.equal({ sid: 'second-session' })
      expect(page.reloads).to.equal(0)
    })

    it('Discards stale fallback SIDs when cookies work and removal is blocked', async function () {
      const page = createPage('remove')
      page.values.set('sid', 'stale-session')
      const storage = loadStorage(page)
      const result = await loadRoot(page, storage, { status: 200 })
      expect(await result.agentOptions.sid()).to.equal(null)
      new result.agentOptions.Connection()
      expect(result.sockets[1].settings.extraHeaders).to.deep.equal({})
      expect(page.reloads).to.equal(0)
    })

    it('Imports callback handling with a blocked localStorage accessor', async function () {
      const page = createPage('accessor', '/auth/login-state/encrypted-token')
      const auth = loadAuth(page, loadStorage(page))
      expect(await auth.getToken()).to.equal(null)
      expect(page.location.href).to.equal('https://app.example/auth/login-state/encrypted-token')
    })

    it('Preserves the callback token handoff with working storage', async function () {
      const page = createPage(undefined, '/auth/login-state/encrypted-token')
      page.values.set('login-state', 'https://app.example/lesson')
      const auth = loadAuth(page, loadStorage(page))
      expect(page.location.href).to.equal('https://app.example/lesson')
      expect(await auth.getToken()).to.equal('encrypted-token')
      expect(page.values.has('token')).to.equal(false)
    })

    for (const failure of ['write', 'silent-write']) {
      it(`Keeps the callback in place when token persistence has a ${failure} failure`, function () {
        const page = createPage(failure, '/auth/login-state/encrypted-token')
        page.values.set('login-state', 'https://app.example/lesson')
        loadAuth(page, loadStorage(page))
        expect(page.location.href).to.equal('https://app.example/auth/login-state/encrypted-token')
        expect(page.values.has('token')).to.equal(false)
      })
    }

    it('Rejects login without redirecting if its transaction cannot persist', async function () {
      const page = createPage('accessor')
      const auth = loadAuth(page, loadStorage(page))
      let failure
      try { await auth.login() }
      catch (error) { failure = error }
      expect(failure).to.be.instanceOf(Error)
      expect(page.location.href).to.equal('https://app.example/')
    })

    it('Rejects logout without reloading if its replacement token cannot persist', function () {
      const page = createPage('accessor')
      const auth = loadAuth(page, loadStorage(page))
      expect(() => auth.logout()).to.throw()
      expect(page.reloads).to.equal(0)
    })

    for (const preference of ['local', 'remote']) {
      it(`Rejects the ${preference} preference without reloading when storage is blocked`, async function () {
        const page = createPage('accessor')
        const result = await loadRoot(page, loadStorage(page))
        expect(() => result.agent[preference]()).to.throw('Unable to store API preference')
        expect(page.reloads).to.equal(0)
      })
    }
  })
}
