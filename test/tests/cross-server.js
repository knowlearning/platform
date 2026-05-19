import configureDomain from '../utils/configure-domain.js'

const DEFAULT_API_PORT = 8765
const DEFAULT_ALIAS_PREFIX = 'socket-io-'
const DEFAULT_TEST_URL = 'https://localhost:5112/'
const DEFAULT_DEV_CONTROL_TOKEN = 'development-control-token'
const isNodeRuntime = () => typeof process !== 'undefined' && process.versions?.node
const loadRedisDiagnostics = async () => {
  const dynamicImport = Function('specifier', 'return import(specifier)')
  return dynamicImport(`file://${process.cwd()}/utils/redis-diagnostics.node.js`)
}

function queryInt(params, name, fallback) {
  const value = Number.parseInt(params.get(name), 10)
  return Number.isFinite(value) && value > 0 ? value : fallback
}

function hostAliases({ apiPort, aliasPrefix, serverCount, aliasCount }) {
  return Array
    .from({ length: aliasCount || serverCount }, (_, i) => {
      return `${aliasPrefix}${i + 1}.localhost:${apiPort + i}`
    })
}

function explicitApiHosts(params) {
  return (params.get('apiHosts') || '')
    .split(',')
    .map(host => host.trim())
    .filter(Boolean)
}

function withTimeout(promise, ms, message) {
  let timeout
  return Promise.race([
    promise.finally(() => clearTimeout(timeout)),
    new Promise((_, reject) => {
      timeout = setTimeout(() => reject(new Error(message)), ms)
    })
  ])
}

async function eventually(fn, { timeout=5000, interval=25, message='Timed out waiting for condition' }={}) {
  const start = Date.now()
  let lastError

  while (Date.now() - start < timeout) {
    try {
      const value = await fn()
      if (value) return value
    }
    catch (error) {
      lastError = error
    }
    await pause(interval)
  }

  if (lastError) throw lastError
  throw new Error(message)
}

async function apiStatus(apiHost) {
  const testUrl = new URL(process.env.TEST_URL || DEFAULT_TEST_URL)
  const response = await fetch(`https://${apiHost}/_dev/status`, {
    headers: {
      accept: 'application/json',
      origin: testUrl.origin,
      'x-dev-control-token': process.env.DEV_CONTROL_TOKEN || DEFAULT_DEV_CONTROL_TOKEN
    }
  })

  if (response.status !== 200) {
    throw new Error(`GET /_dev/status from ${apiHost} returned ${response.status}: ${await response.text()}`)
  }

  return response.json()
}

async function allocateDistinctServerAgents(browserAgent, config) {
  const byServer = new Map()
  const attempts = []

  for (const apiHost of config.apiHosts.length ? config.apiHosts : hostAliases(config)) {
    const agent = browserAgent({
      unique: true,
      root: true,
      apiHost,
      getToken: () => 'anonymous-ephemeral'
    })

    try {
      const environment = await withTimeout(
        agent.environment(),
        5000,
        `Timed out connecting to ${apiHost}`
      )
      attempts.push({
        apiHost,
        server: environment.server,
        user: environment.auth.user
      })

      if (!byServer.has(environment.server)) {
        byServer.set(environment.server, { agent, environment, apiHost })
      }

      if (byServer.size >= config.serverCount) break
    }
    catch (error) {
      attempts.push({ apiHost, error: error.message })
    }
  }

  if (byServer.size < config.serverCount) {
    const summary = attempts
      .map(({ apiHost, server, error }) => `${apiHost} -> ${server || error}`)
      .join('\n')

    const error = new Error(`Expected ${config.serverCount} distinct API servers, saw ${byServer.size}.\n${summary}`)
    error.attempts = attempts
    throw error
  }

  return {
    agents: [...byServer.values()],
    attempts
  }
}

async function expectSharedState(writer, readers) {
  const id = writer.agent.uuid()
  const value = `value-${id}`
  const state = await writer.agent.state(id)
  Object.assign(state, { value, writerServer: writer.environment.server })
  await writer.agent.synced()

  for (const reader of readers) {
    const readState = await reader.agent.state(
      id,
      writer.environment.auth.user,
      writer.environment.domain
    )
    expect(readState).to.deep.equal(state)
  }

  const name = `cross-server/${writer.agent.uuid()}`
  const namedState = await writer.agent.state(name)
  Object.assign(namedState, { value, writerServer: writer.environment.server })
  await writer.agent.synced()

  for (const reader of readers) {
    const readState = await reader.agent.state(
      name,
      writer.environment.auth.user,
      writer.environment.domain
    )
    expect(readState).to.deep.equal(namedState)
  }
}

async function expectWatchAcrossServers(writer, reader) {
  const id = writer.agent.uuid()
  const state = await writer.agent.state(id)
  state.count = 0
  await writer.agent.synced()

  const counts = []
  const unwatch = reader.agent.watch(
    id,
    ({ state }) => {
      if (state.count !== undefined) counts.push(state.count)
    },
    writer.environment.auth.user,
    writer.environment.domain
  )

  await eventually(
    () => counts.length === 1 && counts[0] === 0,
    { message: 'Initial cross-server watch state was not delivered' }
  )

  state.count = 1
  await writer.agent.synced()
  state.count = 2
  await writer.agent.synced()

  await eventually(
    () => counts.length >= 3 && counts[2] === 2,
    { message: 'Cross-server watch updates were not delivered in order' }
  )

  unwatch()
  expect(counts.slice(0, 3)).to.deep.equal([0, 1, 2])
}

async function expectSubscriptionOnConfiguredRedis(writer, reader, subscriptionServer) {
  const redis = await loadRedisDiagnostics()
  const id = writer.agent.uuid()
  const serverNames = ['default', 'redis-2']

  writer.agent.create({
    id,
    active_type: 'application/json',
    active: { count: 0 }
  })
  await writer.agent.synced()

  const before = Object.fromEntries(
    await Promise.all(
      serverNames.map(async serverName => [serverName, await redis.pubsubNumSub(serverName, id)])
    )
  )

  const counts = []
  const unwatch = reader.agent.watch(
    id,
    ({ state }) => {
      if (state.count !== undefined) counts.push(state.count)
    },
    writer.environment.auth.user,
    writer.environment.domain
  )

  await eventually(
    async () => {
      if (!counts.includes(0)) return false
      return (await redis.pubsubNumSub(subscriptionServer, id)) > before[subscriptionServer]
    },
    { message: `Subscription did not appear on Redis server ${subscriptionServer}` }
  )

  for (const serverName of serverNames) {
    const numSubscriptions = await redis.pubsubNumSub(serverName, id)
    if (serverName === subscriptionServer) {
      expect(numSubscriptions).to.be.greaterThan(before[serverName])
    }
    else {
      expect(numSubscriptions).to.equal(before[serverName])
    }
  }

  await writer.agent.interact(id, [
    { op: 'replace', path: ['active', 'count'], value: 1 }
  ])
  await eventually(
    () => counts.includes(1),
    { message: `Watcher on ${subscriptionServer} did not receive publishAll update` }
  )

  unwatch()
}

async function expectStorageRoutingAcrossServers(browserAgent, configurer, readerInfo) {
  const redis = await loadRedisDiagnostics()
  const runId = configurer.agent.uuid()
  const storageDomain = `cross-storage-${runId}.localhost:5112`
  const activeType = `application/json;type=cross-storage-${runId}`
  const writerId = configurer.agent.uuid()
  const readerId = configurer.agent.uuid()
  const writerValue = `cross-storage-writer-${runId}`
  const readerValue = `cross-storage-reader-${runId}`

  await configureDomain(storageDomain, `
redis:
  server: redis-2
postgres:
  server: postgres-2
  tables:
    cross_storage_table:
      type: ${activeType}
      columns:
        text_value: TEXT
  queries:
    cross-storage-cluster-name: |
      SHOW cluster_name
    cross-storage-row: |
      SELECT id, text_value FROM cross_storage_table WHERE id = $1
`, configurer.agent)

  const writer = browserAgent({
    unique: true,
    domain: storageDomain,
    apiHost: configurer.apiHost,
    getToken: () => 'anonymous-ephemeral'
  })
  const reader = browserAgent({
    unique: true,
    domain: storageDomain,
    apiHost: readerInfo.apiHost,
    getToken: () => 'anonymous-ephemeral'
  })

  try {
    await Promise.all([writer.environment(), reader.environment()])

    const writerState = await writer.state(writerId)
    const writerMetadata = await writer.metadata(writerId)
    writerMetadata.active_type = activeType
    writerState.text_value = writerValue
    await writer.synced()

    expect(await reader.query('cross-storage-cluster-name'))
      .to.deep.equal([{ cluster_name: 'postgres-2' }])

    const writerRows = await eventually(
      async () => {
        const result = await reader.query('cross-storage-row', [writerId])
        return result.length === 1 && result[0].text_value === writerValue && result
      },
      { timeout: 7000, interval: 100, message: 'Cross-server routed Postgres query did not observe writer API write' }
    )
    expect(writerRows).to.deep.equal([{ id: writerId, text_value: writerValue }])

    expect((await redis.jsonGet('redis-2', writerId)).active.text_value)
      .to.equal(writerValue)
    expect(await redis.jsonGet('default', writerId)).to.equal(null)

    const readerState = await reader.state(readerId)
    const readerMetadata = await reader.metadata(readerId)
    readerMetadata.active_type = activeType
    readerState.text_value = readerValue
    await reader.synced()

    const readerRows = await eventually(
      async () => {
        const result = await writer.query('cross-storage-row', [readerId])
        return result.length === 1 && result[0].text_value === readerValue && result
      },
      { timeout: 7000, interval: 100, message: 'Cross-server routed Postgres query did not observe reader API write' }
    )
    expect(readerRows).to.deep.equal([{ id: readerId, text_value: readerValue }])
    expect((await redis.jsonGet('redis-2', readerId)).active.text_value)
      .to.equal(readerValue)
    expect(await redis.jsonGet('default', readerId)).to.equal(null)
  }
  finally {
    writer.disconnect?.()
    reader.disconnect?.()
  }
}

async function expectPostgresAcrossServers(writer, reader) {
  const runId = writer.agent.uuid()
  const activeType = `application/json;type=cross-server-${runId}`
  const queryName = 'cross-server-row'
  const value = `postgres-${runId}`
  const id = writer.agent.uuid()

  await configureDomain(writer.environment.domain, `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
postgres:
  tables:
    cross_server_table:
      type: ${activeType}
      columns:
        text_value: TEXT
  queries:
    ${queryName}: |
      SELECT id, text_value FROM cross_server_table WHERE id = $1
  functions:
    same_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
    cross_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingDomain
        type: TEXT
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
`, writer.agent)

  writer.agent.create({
    id,
    active_type: activeType,
    active: { text_value: value }
  })
  await writer.agent.synced()

  const rows = await eventually(
    async () => {
      const result = await reader.agent.query(queryName, [id])
      return result.length === 1 && result[0].text_value === value && result
    },
    { timeout: 5000, interval: 100, message: 'Postgres query did not observe cross-server write' }
  )

  expect(rows).to.deep.equal([{ id, text_value: value }])
}

async function expectUploadAcrossServers(uploader, downloader) {
  const id = uploader.agent.uuid()
  const data = JSON.stringify({
    id,
    server: uploader.environment.server
  })

  await uploader.agent.upload({
    id,
    name: 'cross-server-upload.json',
    type: 'application/json',
    data
  })

  const downloaded = await downloader.agent.download(id).then(r => r.text())
  expect(downloaded).to.equal(data)
}

export default function crossServer(browserAgent, { skipIfUnavailable=false }={}) {
  const params = new URLSearchParams(window.location.search)
  const config = {
    serverCount: queryInt(params, 'serverCount', 3),
    apiPort: queryInt(params, 'apiPort', DEFAULT_API_PORT),
    aliasPrefix: params.get('aliasPrefix') || DEFAULT_ALIAS_PREFIX,
    aliasCount: queryInt(params, 'aliasCount', 0),
    apiHosts: explicitApiHosts(params)
  }

  describe('Cross-server client correctness', function () {
    this.timeout(30000)

    let allocated
    let agents

    before(async function () {
      try {
        allocated = await allocateDistinctServerAgents(browserAgent, config)
        agents = allocated.agents
        window.__crossServerAttempts = allocated.attempts
      }
      catch (error) {
        window.__crossServerAttempts = error.attempts || []
        if (skipIfUnavailable) this.skip()
        throw error
      }
    })

    it('connects clients to distinct API servers', function () {
      const servers = agents.map(({ environment }) => environment.server)
      expect(new Set(servers).size).to.equal(config.serverCount)
    })

    it('shares UUID and named state across servers', async function () {
      await expectSharedState(agents[0], agents.slice(1))
    })

    it('delivers pub/sub updates from server A to server B', async function () {
      await expectWatchAcrossServers(agents[0], agents[1])
    })

    it('delivers pub/sub updates from server B to server A', async function () {
      await expectWatchAcrossServers(agents[1], agents[0])
    })

    it('opens subscriptions on the API server configured Redis server', async function () {
      if (!isNodeRuntime()) this.skip()

      const statuses = await Promise.all(
        agents.map(async agent => ({
          ...agent,
          status: await apiStatus(agent.apiHost)
        }))
      )
      const configured = statuses.find(({ status }) => status.redisSubscriptionServer === 'redis-2')

      if (!configured) this.skip()

      const writer = statuses.find(agent => agent !== configured) || statuses[0]
      await expectSubscriptionOnConfiguredRedis(writer, configured, configured.status.redisSubscriptionServer)
    })

    it('applies Redis and Postgres route configuration across distinct API servers', async function () {
      if (!isNodeRuntime()) this.skip()

      await expectStorageRoutingAcrossServers(browserAgent, agents[0], agents[1])
    })

    it('serves postgres side effects across servers', async function () {
      await expectPostgresAcrossServers(agents[0], agents[1])
    })

    it('serves uploads and downloads across servers', async function () {
      await expectUploadAcrossServers(agents[0], agents[1])
    })
  })
}
