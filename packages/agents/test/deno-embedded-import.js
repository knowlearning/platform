import { describe, it } from 'mocha'
import { expect } from 'chai'

describe('EmbeddedAgent Deno import compatibility', function () {
  it('loads the embedded agent and exposes run-scoped helpers', async function () {
    const { Agent } = await loadEmbeddedAgent()

    expect(Agent.withRunId).to.be.a('function')
  })

  it('resolves fast-json-patch ESM exports under Deno', async function () {
    const { Agent } = await loadEmbeddedAgent()
    const state = { a: 1 }
    const { patch } = Agent.sync(state, { a: 2, b: 3 })

    expect(state).to.deep.equal({ a: 2, b: 3 })
    expect(patch).to.deep.equal([
      { op: 'replace', path: '/a', value: 2 },
      { op: 'add', path: '/b', value: 3 }
    ])
  })
})

async function loadEmbeddedAgent() {
  const { default: EmbeddedAgent } = await import('../agents/embedded.js')

  return { Agent: EmbeddedAgent(() => {}) }
}
