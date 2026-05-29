import configureDomain from '../utils/configure-domain.js'
import browserAgent from '@knowlearning/agents/browser/initialize.js'
import SIMPLE_MIRROR_CONFIGURATION from './domain-agents/simple-mirror-config.js'
import PROXY_TO_SIMPLE_MIRROR_CONFIGURATION from './domain-agents/proxy-to-simple-mirror-config.js'
import LIVENESS_REPORTING_CONFIGURATION from './domain-agents/liveness-reporting-config.js'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const SIMPLE_MIRROR_DOMAIN = `simple-mirror-config.localhost:5112`
const NO_AGENT_CONFIGURATION = `
agent: null
postgres:
  tables: {}
  scopes: {}
`
const HANGING_AGENT_CONFIGURATION = `
agent: |
  await new Promise(() => {})
postgres:
  tables: {}
  scopes: {}
`

export default function () {
  const specialCrossDomainScopeName = `mirror-no-reset/${Agent.uuid()}`
  const specialCrossDomainResetScopeName =`mirror-reset/${Agent.uuid()}`
  const livenessDomain = `liveness-test-${Agent.uuid()}.localhost:5112`
  const agentShutdownDomain = `agent-shutdown-test-${Agent.uuid()}.localhost:5112`

  const CONFIGURATION_1 = `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

  Agent.debug()
  Agent.log('LOADED DENO AGENT')
  Agent.log('AWAITING DENO ENVIRONMENT')
  Agent.log('DENO ENVIRONMENT:', await Agent.environment())

  const TaggingAgent = getAgent('tags.knowlearning.systems')

  //  Test to see if we can spin up an agent connection to another domain
  TaggingAgent
    .state('agents-named-scope-in-other-domain')
    .then(state => {
      function set() {
        state.lastUpdated = Date.now()
        setTimeout(set, 3000)
      }
      set()
    })

  Agent.on('child', child => {
    const { environment: { user } } = child
    Agent.log('GOT CHILD!', user)
    child.on('mutate', mutation => Agent.log('GOT MUTATION!!!', mutation))
    //  TODO: supply session id with child...
    child.on('close', info => Agent.log('GOT CLOSE!!!', user, info))
  })

postgres:
  tables: {}
  scopes: {}
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
        type: TEXT`

  const CONFIGURATION_2 = `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'
  throw new Error('Whoopsie!!!')
postgres:
  tables: {}
  scopes: {}
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
`


  const MIRROR_CONFIGURATION = `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'
  import { standardJSONPatch } from 'npm:@knowlearning/patch-proxy'
  import fastJSONPatch from 'npm:fast-json-patch'

  const serverId = Agent.uuid()

  Agent.on('child', child => {
    const { environment: { user } } = child
    Agent
      .state('child-connections-' + user)
      .then(state => {
        if (!state.connections) state.connections = []
        state.connections.push({ user, serverId })
      })

    child.on('mutate', async mutation => {
      if (mutation.scope.startsWith('mirror-no-reset')) {
        const myState = await Agent.state(mutation.scope)
        fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
      }
      else if (mutation.scope.startsWith('mirror-reconnect')) {
        Agent.reconnect()
        const myState = await Agent.state(mutation.scope)
        setTimeout(() => {
          fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
        }, 100)
      }
      else if (mutation.scope.startsWith('mirror-reset')) {
        const myState = await Agent.state(mutation.scope)
        fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
        setTimeout(() => {
          throw new Error('EXITING WITH ERROR!!!!!!!!!!')
        })
      }
    })
  })

postgres:
  tables: {}
  scopes: {}
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
`

const CONFIGURATION_3 = `
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

  const agentDomain = 'localhost:5112'
  const TestAgent = getAgent(agentDomain)

  //  Test to see if we can spin up an agent connection to another domain
  const scopeNameToMirror = "${specialCrossDomainScopeName}"
  const myState = await TestAgent.state(scopeNameToMirror)
  myState.progress = 'remote-state-opened'
  myState.x = 100
  myState.progress = 'remote-state-wrote-100'

  const start = Date.now()
  const timeout = 10000
  let agentState

  while (Date.now() - start < timeout) {
    agentState = await TestAgent.state(scopeNameToMirror, agentDomain, agentDomain)
    myState.observed = agentState
    if (agentState.x === 100) break
    await new Promise(r => setTimeout(r, 100))
  }

  const success = agentState?.x === 100
  const completionPatch = [
    { op: 'add', path: ['active', 'progress'], value: 'remote-state-observed' },
    { op: 'add', path: ['active', 'success'], value: success }
  ]
  if (!success) {
    completionPatch.push({
      op: 'add',
      path: ['active', 'error'],
      value: 'Timed out waiting for mirrored state'
    })
  }
  await TestAgent.interact(scopeNameToMirror, completionPatch)

  // set up ping to ensure connections to TestAgent connect
  const ping = await TestAgent.state('ping')
  ping.num = 0
  setInterval(() => ping.num += 1, 250)
`


const CONFIGURATION_4 = `
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

  const agentDomain = 'localhost:5112'
  const TestAgent = getAgent(agentDomain)

  //  Test to see if we can spin up an agent connection to another domain
  const scopeNameToMirror = "${specialCrossDomainResetScopeName}"
  const myState = await TestAgent.state(scopeNameToMirror)
  myState.progress = 'remote-state-opened'
  myState.x = 100
  myState.progress = 'remote-state-wrote-100'

  await new Promise(r => setTimeout(r, 100))

  myState.x = 200
  myState.progress = 'remote-state-wrote-200'

  await new Promise(r => setTimeout(r, 400))

  const agentState = await TestAgent.state(scopeNameToMirror, agentDomain, agentDomain)
  myState.observed = agentState

  await TestAgent.interact(scopeNameToMirror, [
    { op: 'add', path: ['active', 'success'], value: agentState.x === 200 }
  ])
`

  describe('Domain Agent', function () {
    it('Configures successfully in a domain', async function () {
      const { domain } = await Agent.environment()
      await configureDomain(domain, CONFIGURATION_1)
    })

    it('Exposes error message when agent script fails to start', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()
      const report = await configureDomain(domain, CONFIGURATION_2)

      const state = await Agent.state(report)

      expect(state.tasks.agent[1]).to.equal('ERROR: Uncaught (in promise) Error: Whoopsie!!!\nline: 2, column: 7')
    })

    it('Allows a hanging domain agent startup to be removed without blocking the domain', async function () {
      this.timeout(10000)

      const domain = `hanging-agent-${Agent.uuid()}.localhost:5112`
      await configureDomain(domain, HANGING_AGENT_CONFIGURATION)
      await configureDomain(domain, NO_AGENT_CONFIGURATION)

      const agent = browserAgent({
        unique: true,
        domain,
        apiHost: process.env.API_HOST || 'socket-io.localhost:8765',
        getToken: () => 'anonymous'
      })

      const withTimeout = (promise, message) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 3000))
      ])

      try {
        const environment = await withTimeout(
          agent.environment(),
          'Timed out waiting for connection after hanging agent removal'
        )
        expect(environment.domain).to.equal(domain)
      }
      finally {
        agent.disconnect?.()
      }
    })

    it('Can establish cross domain agent connections', async function () {
      this.timeout(15000)

      const { domain, auth: { user } } = await Agent.environment()

      const remoteDomain = 'domain-agent-test.localhost:5112'
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await configureDomain(remoteDomain, CONFIGURATION_3 + ' ')

      let state = {}
      const start = Date.now()
      const timeout = 12000

      while (
        state.success === undefined
        && state.observed?.x !== 100
        && Date.now() - start < timeout
      ) {
        await pause(100)
        state = await Agent.state(specialCrossDomainScopeName, remoteDomain, domain)
      }

      expect(state.success === true || state.observed?.x === 100, JSON.stringify(state)).to.equal(true)
    })

    it('Can establish cross domain agent connections that are resilient against domain agent resets', async function () {
      this.timeout(15000)

      const { domain, auth: { user } } = await Agent.environment()

      const remoteDomain = 'domain-agent-test.localhost:5112'
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await configureDomain(remoteDomain, CONFIGURATION_4)

      let state = {}
      const start = Date.now()
      const timeout = 12000

      while (
        state.success === undefined
        && state.observed?.x !== 200
        && Date.now() - start < timeout
      ) {
        await pause(100)
        state = await Agent.state(specialCrossDomainResetScopeName, remoteDomain, domain)
      }

      expect(state.success === true || state.observed?.x === 200, JSON.stringify(state)).to.equal(true)
    })

    it('Connects to most recently deployed third party domain', async function () {
      this.timeout(15000)

      const { domain, auth: { user } } = await Agent.environment()
      const remoteDomain = 'domain-agent-test.localhost:5112'

      const childConnectionScope = `child-connections-${remoteDomain}`
      const { connections } = await Agent.state(childConnectionScope, domain, domain)
      const initialConnections = connections?.length || 0

      await configureDomain(remoteDomain, CONFIGURATION_3)
      await pause(1000)
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await pause(100)
      // reconfigure to force reconnection
      await configureDomain(domain, MIRROR_CONFIGURATION)

      let nextConnections = []

      while (new Set(nextConnections.map(({ serverId }) => serverId)).size < 2) {
        await pause(100)
        nextConnections = (
          (await Agent.state(childConnectionScope, domain, domain)).connections || []
        ).slice(initialConnections)
      }

      expect(new Set(nextConnections.map(({ serverId }) => serverId)).size).to.be.greaterThan(1)
    })

    it('Can connect back to a domain agent that has reconnected itself', async function () {
      this.timeout(15000)

      const { domain, auth: { user } } = await Agent.environment()

      await configureDomain(domain, MIRROR_CONFIGURATION)

      const reconnectMirroredStateName = 'mirror-reconnect/' + uuid()
      const reconnectMirroredState = await Agent.state(reconnectMirroredStateName)

      reconnectMirroredState.x = 100
      await new Promise((resolve, reject) => {
        Agent.watch(reconnectMirroredStateName, ({ state }) => {
          if (state.x === 100) resolve()
        }, domain)
      })

      reconnectMirroredState.x = 200
      await new Promise((resolve, reject) => {
        Agent.watch(reconnectMirroredStateName, ({ state }) => {
          if (state.x === 200) resolve()
        }, domain)
      })

    })

    it('Can keep mirroring with new agent configurations', async function () {
      this.timeout(15000)
      const { domain, auth: { user } } = await Agent.environment()
      await configureDomain(SIMPLE_MIRROR_DOMAIN, SIMPLE_MIRROR_CONFIGURATION)
      await configureDomain(domain, PROXY_TO_SIMPLE_MIRROR_CONFIGURATION)

      const myStateName = 'mirror/' + uuid()
      const myState = await Agent.state(myStateName)

      myState.x = 200
      await new Promise((resolve, reject) => {
        Agent.watch(myStateName, ({ state }) => {
          if (state.x === 200) resolve()
        }, SIMPLE_MIRROR_DOMAIN, SIMPLE_MIRROR_DOMAIN)
      })
    })

    it('Can configure many agents in series and only 1 is active at a time', async function() {
      this.timeout(20000)

      const waitForConfiguration = promise => Promise.race([
        promise,
        pause(250)
      ])

      for (let i=0; i<30; i++) {
        const p = configureDomain(livenessDomain, LIVENESS_REPORTING_CONFIGURATION).catch(() => {})
        if (i % 2) await waitForConfiguration(p)
      }

      let livenessTrackers = {}
      const start = Date.now()
      while (
        !Object.keys(livenessTrackers).length
        && Date.now() - start < 15000
      ) {
        await pause(100)
        livenessTrackers = await Agent.state('liveness-trackers', livenessDomain, livenessDomain)
      }

      expect(Object.keys(livenessTrackers).length).to.be.greaterThan(0)

      await pause(750)
      livenessTrackers = await Agent.state('liveness-trackers', livenessDomain, livenessDomain)
      const activeSince = Date.now() - 1000
      const activeTrackers = Object
        .values(livenessTrackers)
        .filter(({ ping }) => ping >= activeSince)

      expect(activeTrackers).to.have.length(1)
    })

    it('Stops an existing domain agent when configuration removes agent', async function () {
      this.timeout(20000)

      await configureDomain(agentShutdownDomain, LIVENESS_REPORTING_CONFIGURATION)

      let livenessTrackers = {}
      const start = Date.now()
      while (
        !Object.keys(livenessTrackers).length
        && Date.now() - start < 5000
      ) {
        await pause(100)
        livenessTrackers = await Agent.state('liveness-trackers', agentShutdownDomain, agentShutdownDomain)
      }

      const [session] = Object.keys(livenessTrackers)
      expect(session).to.not.equal(undefined)

      await configureDomain(agentShutdownDomain, NO_AGENT_CONFIGURATION)
      await pause(400)

      livenessTrackers = await Agent.state('liveness-trackers', agentShutdownDomain, agentShutdownDomain)
      const stoppedPing = livenessTrackers[session].ping

      await pause(500)

      livenessTrackers = await Agent.state('liveness-trackers', agentShutdownDomain, agentShutdownDomain)
      expect(livenessTrackers[session].ping).to.equal(stoppedPing)
    })
  })
}
