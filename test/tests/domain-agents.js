const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const endOfReport = id => new Promise(r => Agent.watch(id, u => u.state.end && r()))

export default function () {
  const CONFIGURATION = `
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

  describe('Domain Agents', function () {
    it('Can configure a domain for agents', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()

      const config = await Agent.upload({
        type: 'application/yaml',
        data: CONFIGURATION
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })

      await endOfReport(report)
    })
  })
}