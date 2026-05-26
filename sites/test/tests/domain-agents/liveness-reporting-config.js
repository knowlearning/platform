export default `
agent: |
  import Agent from 'npm:@knowlearning/agents/deno.js'

  const { session } = await Agent.environment()

  const livenessTrackers = await Agent.state('liveness-trackers')

  livenessTrackers[session] = {
  	start: Date.now(),
  	ping: Date.now()
  }

  setInterval(() => livenessTrackers[session].ping = Date.now(), 200)

authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
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