import { expect } from 'chai'
import { makeState } from './helpers.js'
import { applyPatch } from './utils.js'

describe('Ephemeral paths', function() {

  it('setting an ephemeral leaf directly does not emit patches', function() {
    const { state, patches } = makeState(
      { ui: { temp: { x: 1 } } },
      { ephemeralPaths: { '/ui/temp/x': true } }
    )

    state.ui.temp.x = 999
    expect(patches.flat()).to.deep.equal([])

    // applyPatch sees nothing, but local mutation happened
    expect(state.ui.temp.x).to.equal(999)
  })

  it('setting a non-ephemeral sibling still emits patches', function() {
    const { state, patches } = makeState(
      { ui: { temp: { x: 1 }, stable: { y: 1 } } },
      { ephemeralPaths: { '/ui/temp': true } }
    )

    state.ui.stable.y = 2
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })
})
