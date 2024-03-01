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
  import Agent from 'npm:@knowlearning/agents/deno.js'
  Agent.debug()
  console.log('LOADED DENO AGENT')
  console.log('AWAITING DENO ENVIRONMENT')
  console.log('DENO ENVIRONMENT:', await Agent.environment())
  
  Agent.on('child', child => {
    const { environment: { user } } = child
    console.log('GOT CHILD!!!', child)
    Agent.log('GOT CHILD!!!', user)
    child.on('mutate', mutation => console.log('GOT MUTATION!!!', mutation))
    child.on('close', info => console.log('GOT CLOSE!!!', info))
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