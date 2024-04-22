const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

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

  await awaitInitialized ? domainAgentInitialized(report) : domainAgentConfigured(report)
  return report
}

export default function () {
  const specialCrossDomainScopeName = `mirror-no-reset/${Agent.uuid()}`
  const specialCrossDomainReconnectServerScopeName =`mirror-reset/${Agent.uuid()}`

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

  Agent.on('child', child => {
    const { environment: { user } } = child
    child.on('mutate', async mutation => {
      if (mutation.scope.startsWith('mirror-no-reset')) {
        const myState = await Agent.state(mutation.scope)
        fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
      }
      else if (mutation.scope.startsWith('mirror-reset')) {
        const myState = await Agent.state(mutation.scope)
        fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
        setTimeout(() => {
          console.log('DENO EXITING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
          Deno.exit()
        }, 10)
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
`


const CONFIGURATION_4 = `
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

  const agentDomain = 'localhost:5112'
  const TestAgent = getAgent(agentDomain)

  //  Test to see if we can spin up an agent connection to another domain
  const scopeNameToMirror = "${specialCrossDomainReconnectServerScopeName}"
  const myState = await TestAgent.state(scopeNameToMirror)
  myState.x = 100

  await new Promise(r => setTimeout(r, 100))

  myState.x = 200

  await new Promise(r => setTimeout(r, 100))

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
      await configureDomain(remoteDomain, CONFIGURATION_3)

      let state = {}

      while (state.success === undefined) {
        await pause(100)
        state = await Agent.state(specialCrossDomainScopeName, remoteDomain, domain)
      }

      expect(state.success).to.equal(true)
    })

    it('Can establish cross domain agent connections that are resilient against reconnections', async function () {
      this.timeout(5000)

      const { domain, auth: { user } } = await Agent.environment()

      const remoteDomain = 'domain-agent-test.localhost:5112'
      await configureDomain(domain, MIRROR_CONFIGURATION)
      await configureDomain(remoteDomain, CONFIGURATION_4)

      let state = {}
      while (state.success === undefined) {
        await pause(100)
        state = await Agent.state(specialCrossDomainReconnectServerScopeName, remoteDomain, domain)
      }

      expect(state.success).to.equal(true)
    })

  })
}