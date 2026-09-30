import queueSource from '../../packages/agents/agents/generic/message-queue.js?raw'
import browserRootSource from '../../packages/agents/agents/browser/root.js?raw'
import nodeRootSource from '../../packages/agents/agents/node/root.js?raw'

async function flushMicrotasks() {
  for (let index = 0; index < 10; index++) await Promise.resolve()
}

function createClock() {
  let now = 0
  let nextId = 0
  const timers = new Map()

  return {
    setTimeout(callback, delay=0) {
      const id = ++nextId
      timers.set(id, { callback, at: now + delay })
      return id
    },
    clearTimeout(id) {
      timers.delete(id)
    },
    async advance(duration) {
      const end = now + duration
      await flushMicrotasks()
      while (true) {
        const next = [...timers.entries()]
          .filter(([, timer]) => timer.at <= end)
          .sort((left, right) => left[1].at - right[1].at)[0]
        if (!next) break
        const [id, timer] = next
        timers.delete(id)
        now = timer.at
        timer.callback()
        await flushMicrotasks()
      }
      now = end
    }
  }
}

async function createHarness(rootSource) {
  const clock = createClock()
  const sockets = []
  const quietConsole = { log() {}, warn() {}, error() {} }
  const io = () => {
    const socket = {
      handlers: {},
      messages: [],
      on(event, callback) { this.handlers[event] = callback },
      emit(event, message) { this.messages.push(message) },
      disconnect() {},
      io: { on() {}, engine: { on() {} } }
    }
    sockets.push(socket)
    return socket
  }

  let Connection = function () {
    const socket = io()
    socket.on('connect', () => this.onopen())
    socket.on('message', message => this.onmessage(message))
    socket.on('disconnect', reason => this.onclose(reason))
    this.send = message => socket.emit('message', message)
    this.close = () => socket.disconnect()
  }

  if (rootSource) {
    const dependencies = {
      window: { location: { host: 'heartbeat.test', reload() {} } },
      navigator: { languages: ['en'] },
      process: { env: {} },
      console: quietConsole,
      storage: { getItem() {}, setItem() {}, removeItem() {} },
      fetch: async () => ({ status: 200 }),
      io,
      GenericAgent: options => ({ Connection: options.Connection }),
      getToken: () => 'anonymous',
      login() {},
      logout() {},
      uuid: () => 'heartbeat-test-id',
      applyPatch() {}
    }
    const createRoot = new Function(
      ...Object.keys(dependencies),
      rootSource.replace(/^import .*$/gm, '').replace('export default', 'return')
    )(...Object.values(dependencies))
    Connection = createRoot({ apiHost: 'api.heartbeat.test' }).Connection
  }

  const createQueue = new Function(
    'isUUID', 'standardJSONPatch', 'pkg', 'setTimeout', 'clearTimeout', 'console',
    queueSource.replace(/^import .*$/gm, '').replace('export default', 'return')
  )(() => false, patch => patch, { version: 'test' }, clock.setTimeout, clock.clearTimeout, quietConsole)
  const [queueMessage, , disconnect] = createQueue({
    Connection,
    domain: 'heartbeat.test',
    token: () => 'anonymous',
    sid: () => 'heartbeat-test-sid',
    watchers: {},
    states: {},
    log() {},
    reboot() {},
    applyPatch() {}
  })
  await flushMicrotasks()

  const authenticate = async (socket=sockets[0], ack=-1) => {
    await socket.handlers.connect()
    await socket.handlers.message({
      auth: { user: 'heartbeat-user' },
      session: 'heartbeat-session',
      server: 'heartbeat-server',
      ack
    })
  }

  return { clock, sockets, queueMessage, disconnect, authenticate }
}

export default function connectionHeartbeat() {
  describe('Connection heartbeat', function () {
    for (const [transport, source] of [['Browser', browserRootSource], ['Node', nodeRootSource]]) {
      it(`${transport} Socket.IO waits for authentication and delayed responses beyond ten seconds`, async function () {
        const harness = await createHarness(source)
        try {
          await harness.clock.advance(15000)
          expect(harness.sockets).to.have.length(1)
          await harness.authenticate()
          const responsePromise = harness.queueMessage({ scope: 'sessions', patch: [], context: [] })
          await harness.clock.advance(20000)
          expect(harness.sockets).to.have.length(1)
          await harness.sockets[0].handlers.message(undefined)
          await harness.clock.advance(15000)
          expect(harness.sockets).to.have.length(1)
          const response = { si: 0, rows: Array.from({ length: 80000 }, (_, index) => ({ index })) }
          await harness.sockets[0].handlers.message(response)
          expect(await responsePromise).to.equal(response)
          expect(harness.sockets[0].messages.at(-1)).to.deep.equal({ ack: 0 })
        }
        finally {
          harness.disconnect()
        }
      })

      it(`${transport} Socket.IO still recovers a pending response after a transport disconnect`, async function () {
        const harness = await createHarness(source)
        try {
          await harness.authenticate()
          const responsePromise = harness.queueMessage({ scope: 'sessions', patch: [], context: [] })
          await flushMicrotasks()
          await harness.sockets[0].handlers.disconnect('ping timeout')
          await harness.clock.advance(0)
          expect(harness.sockets).to.have.length(2)
          await harness.authenticate(harness.sockets[1], 0)
          await harness.clock.advance(15000)
          expect(harness.sockets).to.have.length(2)
          const response = { si: 0, rows: [{ recovered: true }] }
          await harness.sockets[1].handlers.message(response)
          expect(await responsePromise).to.equal(response)
        }
        finally {
          harness.disconnect()
        }
      })
    }

    it('Retains the watchdog and heartbeat resets for transports without native heartbeats', async function () {
      const harness = await createHarness()
      try {
        await harness.authenticate()
        await harness.clock.advance(9000)
        await harness.sockets[0].handlers.message(undefined)
        await harness.clock.advance(9000)
        expect(harness.sockets).to.have.length(1)
        await harness.clock.advance(1000)
        expect(harness.sockets).to.have.length(2)
      }
      finally {
        harness.disconnect()
      }
    })
  })
}
