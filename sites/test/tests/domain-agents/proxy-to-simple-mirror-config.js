export default `
agent: |
  import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'
  import { standardJSONPatch } from 'npm:@knowlearning/patch-proxy'
  import fastJSONPatch from 'npm:fast-json-patch'

  const SimpleMirrorAgent = getAgent('simple-mirror-config.localhost:5112')

  Agent.on('child', child => {
    child.on('mutate', async mutation => {
      if (!mutation.scope.startsWith('mirror/')) return

      const myState = await SimpleMirrorAgent.state(mutation.scope)
      fastJSONPatch.applyPatch(myState, standardJSONPatch(mutation.patch))
    })
  })
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
