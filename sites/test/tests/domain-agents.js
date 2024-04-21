const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const endOfReport = id => new Promise(r => Agent.watch(id, u => u.state.end && r()))

export default function () {
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

const CONFIGURATION_3 = `

postgres:
  tables: {}
  scopes: {}
  functions: {}
agent: |
  import Agent from 'npm:@knowlearning/agents/deno.js'

  console.log('AGENT CONFIGURED????')

  console.log('AGENT CONNECTED?', await Agent.environment())
`

  describe('Domain Agent', function () {
    it('Configures successfully in a domain', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()

      const config = await Agent.upload({
        type: 'application/yaml',
        data: CONFIGURATION_1
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })

      Agent.watch(report, r => console.log(r.state))
      await endOfReport(report)
      const r = await Agent.state(report)
      expect(r.tasks.agent[1]).to.equal('done')
    })

    it('Exposes error message when agent script fails to start', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()

      const config = await Agent.upload({
        type: 'application/yaml',
        data: CONFIGURATION_2
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })

      await endOfReport(report)
      const r = await Agent.state(report)
      expect(r.tasks.agent[1]).to.equal('ERROR: Uncaught (in promise) Error: Whoopsie!!!\nline: 3, column: 7')
    })

    it('Can establish cross domain agent connections that are resilient against reconnections', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()

      const config = await Agent.upload({
        type: 'application/yaml',
        data: CONFIGURATION_3
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain: 'domain-agent-test.localhost:5112' }
      })
    })
  })
}