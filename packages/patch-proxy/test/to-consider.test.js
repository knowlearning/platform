import { expect } from 'chai'
import { makeState } from './helpers.js'
import { applyPatch } from './utils.js'

describe('Cases to consider', function() {
  it('deleting an array index emits remove (and local delete happens)', function() {
    const { state, patches } = makeState({})
    state.myArray = [1, 2, 3]
    delete state.myArray[1]
    const patched = applyPatch({}, patches.flat())
    expect(state).to.deep.equal(patched)
  })

  it('does not proxy or patch ephemeral subtree at construction time', function() {
    const { state, patches } = makeState(
      { ui: { temp: { x: 1 } }, keep: { x: 1 } },
      { ephemeralPaths: { '/ui/temp': true } }
    )

    state.ui.temp.x = 2
    state.keep.x = 2

    const flat = patches.flat()
    expect(flat.some(p => p.path?.[0] === 'ui')).to.equal(true) // ui gets proxied, but temp should be raw
    expect(flat.some(p => p.path?.join('/') === 'ui/temp/x')).to.equal(false)

    expect(state).to.deep.equal(applyPatch({}, flat))
  })

  it('throws if the same original object is added to multiple mutable parents', function() {
    const patches = []
    const root = new PatchProxy({ a: {}, b: {} }, p => patches.push(p))

    const shared = { x: 1 }
    root.a.child = shared

    expect(() => {
      root.b.child = shared
    }).to.throw(/multiple mutable parents/i)
  })

  // likely this behavior is just fine, but we might want to be strict
  it('throws when an object that contains invalid values is set inside a proxy', function() {
    const { state, patches } = makeState({})
    const patched = applyPatch({}, patches.flat())
    expect(patched.obj).to.deep.equal({ ok: true })
    expect(state).to.deep.equal(patched)
    expect(() => {
      state.obj = { ok: true, fn: () => 1, bad: undefined }
    }).to.throw()
  })
})