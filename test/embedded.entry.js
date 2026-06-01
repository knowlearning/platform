import { v1 as uuid } from 'uuid'
import * as chai from 'chai'
import {
  createEmbeddedTarget,
  installTestEnvironment,
  installEmbeddedTargetHarness
} from './embedded-harness.js'

export default async function registerEmbeddedHarness() {
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'
  process.env.API_HOST ||= 'socket-io.localhost:8765'
  process.env.TEST_URL ||= 'https://localhost:5112/'
  const testUrl = new URL(process.env.TEST_URL)
  if (process.env.API_HOSTS) testUrl.searchParams.set('apiHosts', process.env.API_HOSTS)
  if (process.env.SERVER_COUNT) testUrl.searchParams.set('serverCount', process.env.SERVER_COUNT)
  if (process.env.API_PORT) testUrl.searchParams.set('apiPort', process.env.API_PORT)
  if (process.env.ALIAS_COUNT) testUrl.searchParams.set('aliasCount', process.env.ALIAS_COUNT)
  const startupTimeout = Number.parseInt(process.env.TEST_STARTUP_TIMEOUT || '15000', 10)

  installTestEnvironment({
    url: testUrl.href
  })
  globalThis.localStorage.setItem('API_HOST', process.env.API_HOST)

  const [
    { default: Agent },
    { default: browserAgent },
    { vuePersistentStore },
    { default: latestBugfixes },
    { default: historyPatchFormat },
    { default: mutate },
    { default: watch },
    { default: watchDeep },
    { default: multiAgent },
    { default: arrays },
    { default: metadata },
    { default: uploads },
    { default: vuex },
    { default: postgres },
    { default: domainAgents },
    { default: newDomainAgents },
    { default: stateTest },
    { default: environmentTest },
    { default: namespacedEmbeddings },
    { default: syncedState },
    { default: reconnect },
    { default: crossServer }
  ] = await Promise.all([
    import('@knowlearning/agents/browser.js'),
    import('@knowlearning/agents/browser/initialize.js'),
    import('@knowlearning/agents/vue.js'),
    import('./tests/latest-bugfixes.js'),
    import('./tests/history-patch-format.js'),
    import('./tests/mutate.js'),
    import('./tests/watch.js'),
    import('./tests/watch-deep.js'),
    import('./tests/multi-agent.js'),
    import('./tests/arrays.js'),
    import('./tests/metadata.js'),
    import('./tests/uploads.js'),
    import('./tests/vuex.js'),
    import('./tests/postgres.js'),
    import('./tests/domain-agents.js'),
    import('./tests/new-domain-agents.js'),
    import('./tests/state.js'),
    import('./tests/environment.js'),
    import('./tests/namespaced-embeddings.js'),
    import('./tests/synced-state.js'),
    import('./tests/reconnect.js'),
    import('./tests/cross-server.js')
  ])

  installEmbeddedTargetHarness(Agent)

  globalThis.expect = window.expect = chai.expect
  globalThis.uuid = window.uuid = uuid
  globalThis.pause = window.pause = ms => new Promise(resolve => setTimeout(resolve, ms))

  chai.config.truncateThreshold = 0

  const requireEnvironment = async (name, agent) => {
    const timeout = new Promise((_, reject) => setTimeout(
      () => reject(new Error(
        `Timed out establishing ${name} connection to ${process.env.API_HOST}. `
        + 'Set API_HOST if your local API alias differs.'
      )),
      startupTimeout
    ))

    return Promise.race([agent.environment(), timeout])
  }

  const setActiveContext = context => {
    globalThis.__embeddedHarnessCurrentAgent = context.Agent
    globalThis.Agent = window.Agent = context.Agent
    globalThis.Agent2 = window.Agent2 = context.Agent2
    globalThis.Agent3 = window.Agent3 = context.Agent3
  }

  // Some test modules derive ids while their suite is being defined, before
  // per-suite before() hooks run. Give them a harmless registration-time Agent.
  setActiveContext({
    Agent,
    Agent2: Agent,
    Agent3: Agent
  })

  const createCompanionAgents = () => ({
    Agent2: browserAgent({
      unique: true,
      getToken: () => 'anonymous',
      root: true
    }),
    Agent3: browserAgent({
      unique: true,
      getToken: () => 'anonymous',
      root: true
    })
  })

  const createRootAgent = () => browserAgent({
    unique: true,
    getToken: () => 'anonymous',
    root: true
  })

  const disconnectAgent = async agent => {
    try {
      await agent?.disconnect?.()
    }
    catch (error) {
      console.warn('Error disconnecting embedded harness agent', error)
    }
  }

  const destroyContext = async context => {
    if (!context) return

    await disconnectAgent(context.Agent2)
    await disconnectAgent(context.Agent3)

    if (!context.skipAgentDisconnect) await disconnectAgent(context.Agent)

    try {
      await context.teardown?.()
    }
    catch (error) {
      console.warn(`Error tearing down embedded harness context "${context.name}"`, error)
    }
  }

  const createContext = async (name, agent, options={}) => {
    const context = {
      name,
      Agent: agent,
      ...createCompanionAgents(),
      teardown: options.teardown,
      skipAgentDisconnect: options.skipAgentDisconnect === true
    }

    installEmbeddedTargetHarness(context.Agent)
    installEmbeddedTargetHarness(context.Agent2)
    installEmbeddedTargetHarness(context.Agent3)

    setActiveContext(context)
    await Promise.all([
      requireEnvironment(`${name} Agent`, context.Agent),
      requireEnvironment(`${name} Agent2`, context.Agent2),
      requireEnvironment(`${name} Agent3`, context.Agent3)
    ])

    return context
  }

  const origin = testUrl.origin
  const allContexts = new Set(['root', 'embed1', 'embed2'])
  const requestedContexts = new Set(
    (process.env.TEST_CONTEXTS || 'root,embed1,embed2')
      .split(',')
      .map(context => context.trim().toLowerCase())
      .filter(Boolean)
  )
  if (requestedContexts.has('all')) {
    requestedContexts.clear()
    allContexts.forEach(context => requestedContexts.add(context))
  }
  const invalidContexts = [...requestedContexts].filter(context => !allContexts.has(context))
  if (invalidContexts.length) {
    throw new Error(`Invalid TEST_CONTEXTS value(s): ${invalidContexts.join(', ')}`)
  }
  if (!requestedContexts.size) throw new Error('TEST_CONTEXTS did not select any embedded test contexts')
  const includesContext = context => requestedContexts.has(context)

  const createRootContext = (name, agent=createRootAgent()) => createContext(name, agent)

  const createEmbeddedContext = async (name, createParentContext, mode) => {
    const parentContext = await createParentContext()
    try {
      const target = createEmbeddedTarget(window)
      document.body.appendChild(target)

      let resolveOpen
      let rejectOpen
      const opened = new Promise((resolve, reject) => {
        resolveOpen = resolve
        rejectOpen = reject
      })
      const openTimeout = setTimeout(
        () => rejectOpen(new Error(`Timed out opening embedded test context "${name}"`)),
        startupTimeout
      )

      const embedding = parentContext.Agent.embed({
        id: `${origin}/${mode}`,
        mode
      }, target)

      embedding.on('open', () => {
        clearTimeout(openTimeout)
        resolveOpen()
      })
      embedding.on('close', info => {
        clearTimeout(openTimeout)
        rejectOpen(new Error(`Embedded test context "${name}" closed unexpectedly: ${JSON.stringify(info)}`))
      })

      await opened

      const childAgent = target.__embeddedHarnessChild?.agent
      if (!childAgent) throw new Error(`Embedded test context "${name}" did not expose a child agent`)

      return createContext(name, childAgent, {
        skipAgentDisconnect: true,
        teardown: async () => {
          embedding.remove()
          await destroyContext(parentContext)
        }
      })
    }
    catch (error) {
      await destroyContext(parentContext)
      throw error
    }
  }

  function registerSuite(createSuiteContext, { title, includeRootOnly }) {
    describe(title, function () {
      let context

      before(async function () {
        this.timeout(startupTimeout)
        context = await createSuiteContext()
        setActiveContext(context)
      })

      beforeEach(() => setActiveContext(context))

      after(async function () {
        this.timeout(startupTimeout)
        await destroyContext(context)
      })

      latestBugfixes()
      historyPatchFormat()
      if (includeRootOnly) crossServer(browserAgent, { skipIfUnavailable: true })
      if (includeRootOnly) postgres()
      if (includeRootOnly) domainAgents()
      stateTest()
      environmentTest()
      metadata()
      mutate()
      arrays()
      watch()
      if (includeRootOnly) newDomainAgents()
      watchDeep()
      vuex(vuePersistentStore)
      namespacedEmbeddings()
      if (includeRootOnly) reconnect()
      uploads()
      multiAgent()
      syncedState()
    })
  }

  describe('Embedded Harness Core API', function () {
    if (includesContext('root')) {
      registerSuite(
        () => createRootContext('Root', Agent),
        {
        title: 'Root Core API',
        includeRootOnly: true
        }
      )
    }
    if (includesContext('embed1')) {
      registerSuite(
        () => createEmbeddedContext('Embed Level 1', () => createRootContext('Embed Level 1 Parent'), 'test+'),
        {
        title: 'Embed Level 1 Core API',
        includeRootOnly: false
        }
      )
    }
    if (includesContext('embed2')) {
      registerSuite(
        () => createEmbeddedContext(
          'Embed Level 2',
          () => createEmbeddedContext('Embed Level 2 Parent', () => createRootContext('Embed Level 2 Grandparent'), 'test+'),
          'test++'
        ),
        {
        title: 'Embed Level 2 Core API',
        includeRootOnly: false
        }
      )
    }
  })
}
