import SIMPLE_MIRROR_CONFIGURATION from './domain-agents/simple-mirror-config.js'
import PROXY_TO_SIMPLE_MIRROR_CONFIGURATION from './domain-agents/proxy-to-simple-mirror-config.js'

const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const SIMPLE_MIRROR_DOMAIN = `simple-mirror-config.localhost:5112`

const domainAgentConfigured = id => new Promise(r => Agent.watch(id, u => u.state.tasks?.agent?.[1] === 'done' && r()))
const domainAgentInitialized = id => new Promise(r => Agent.watch(id, u => u.state.tasks?.agent?.[0] && r()))

async function configureDomain(domain, configuration, awaitInitialized) {
  const config = await Agent.upload({
    type: 'application/yaml',
    data: configuration
  })
  const report = uuid()

  await Agent.create({
    active_type: DOMAIN_CONFIG_TYPE,
    active: { config, report, domain }
  })

  awaitInitialized ? await domainAgentInitialized(report) : await domainAgentConfigured(report)
  return report
}

export default function () {
  const specialCrossDomainScopeName = `mirror-no-reset/${Agent.uuid()}`
  const specialCrossDomainResetScopeName =`mirror-reset/${Agent.uuid()}`

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
  console.log('DENO STARTING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')

  const serverId = Agent.uuid()

  Agent.on('child', child => {
    console.log('GOT CHILD!', child)
    const { environment: { user } } = child
    Agent
      .state('child-connections-' + user)
      .then(state => {
        if (!state.connections) state.connections = []
        state.connections.push({ user, serverId })
      })

    child.on('mutate', async mutation => {
      console.log('MUTATION!!!!!!!!!!!!!!!!!!!', mutation)
      if (mutation.scope.startsWith('mirror-no-reset')) {
        const myState = await Agent.state(mutation.scope)
        fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
      }
      else if (mutation.scope.startsWith('mirror-reconnect')) {
        console.log('AGENT RECONNECTING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
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
          console.log('DENO EXITING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
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
  myState.x = 100

  await new Promise(r => setTimeout(r, 100))

  const agentState = await TestAgent.state(scopeNameToMirror, agentDomain, agentDomain)

  myState.success = agentState.x === 100

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
  myState.x = 100

  await new Promise(r => setTimeout(r, 100))

  myState.x = 200

  await new Promise(r => setTimeout(r, 400))

  const agentState = await TestAgent.state(scopeNameToMirror, agentDomain, agentDomain)

  myState.success = agentState.x === 200
`

  describe('Domain Agent', function () {
    it('Configures successfully in a domain', async function () {
      this.timeout(5000)
      const { domain } = await Agent.environment()
      await configureDomain(domain, CONFIGURATION_1)
    })

    it('Exposes error message when agent script fails to start', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()
      const report = await configureDomain(domain, CONFIGURATION_2, true)

      let state = {}

      while (!state.tasks?.agent?.[1]) {
        await pause(100)
        state = await Agent.state(report)
      }
      expect(state.tasks.agent[1]).to.equal('ERROR: Uncaught (in promise) Error: Whoopsie!!!\nline: 2, column: 7')
    })

    it('Can establish cross domain agent connections', async function () {
      this.timeout(5000)

      const { domain, auth: { user } } = await Agent.environment()

      const remoteDomain = 'domain-agent-test.localhost:5112'
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await configureDomain(remoteDomain, CONFIGURATION_3 + ' ')

      let state = {}

      while (state.success === undefined) {
        await pause(100)
        state = await Agent.state(specialCrossDomainScopeName, remoteDomain, domain)
      }

      expect(state.success).to.equal(true)
    })

    it('Can establish cross domain agent connections that are resilient against domain agent resets', async function () {
      this.timeout(5000)

      const { domain, auth: { user } } = await Agent.environment()

      const remoteDomain = 'domain-agent-test.localhost:5112'
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await configureDomain(remoteDomain, CONFIGURATION_4)

      let state = {}
      while (state.success === undefined) {
        await pause(100)
        state = await Agent.state(specialCrossDomainResetScopeName, remoteDomain, domain)
      }

      expect(state.success).to.equal(true)
    })

    it('Connects to most recently deployed third party domain', async function () {
      this.timeout(5000)

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

      let nextConnections

      while (!nextConnections || nextConnections.length < initialConnections + 2) {
        await pause(100)
        nextConnections = (await Agent.state(childConnectionScope, domain, domain)).connections
      }

      const a = nextConnections.pop()
      const b = nextConnections.pop()
      expect(a.serverId).to.not.equal(b.serverId)
    })

    it('Can connect back to a domain agent that has reconnected itself', async function () {
      this.timeout(5000)

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

      console.log('passed 1')

      reconnectMirroredState.x = 200
      await new Promise((resolve, reject) => {
        Agent.watch(reconnectMirroredStateName, ({ state }) => {
          if (state.x === 200) resolve()
        }, domain)
      })

      console.log('passed 2')
    })

    it('Can keep mirroring with new agent configurations', async function () {
      this.timeout(5000)
      const { domain, auth: { user } } = await Agent.environment()
      await configureDomain(SIMPLE_MIRROR_DOMAIN, SIMPLE_MIRROR_CONFIGURATION)
      await configureDomain(domain, PROXY_TO_SIMPLE_MIRROR_CONFIGURATION)

      const myStateName = 'mirror/' + uuid()
      const myState = await Agent.state(myStateName)

      myState.x = 200
      await new Promise((resolve, reject) => {
        Agent.watch(myStateName, ({ state }) => {
          console.log('INTERESTING....?', state)
          if (state.x === 200) resolve()
        }, SIMPLE_MIRROR_DOMAIN, SIMPLE_MIRROR_DOMAIN)
      })
    })
  })
}