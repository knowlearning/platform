import { expect } from 'chai'
import { makeState } from './helpers.js'
import { applyPatch } from './utils.js'

describe('Objects', function() {
  it('adds a new primitive property (add)', function() {
    const { state, patches } = makeState({})
    state.x = 100
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('replaces an existing primitive property (replace)', function() {
    const { state, patches } = makeState({ x: 1 })
    state.x = 2
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('adds then deletes a property (remove)', function() {
    const { state, patches } = makeState({})
    state.x = 100
    delete state.x
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('deleting a missing property is a no-op (no patch)', function() {
    const { state, patches } = makeState({ x: 1 })
    delete state.y
    expect(patches.flat()).to.deep.equal([])
    expect(state).to.deep.equal({ x: 1 })
  })

  it('creates nested objects and updates deep fields', function() {
    const { state, patches } = makeState({})
    state.user = { profile: { name: 'a' } }
    state.user.profile.name = 'b'
    state.user.profile.age = 42
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('replaces a nested object with a new object', function() {
    const original = { user: { profile: { name: 'a' } } }
    const { state, patches } = makeState(original)
    //throw new Error(JSON.stringify(state))
    state.user.profile = { name: 'b', ok: true }
    expect(state).to.deep.equal(applyPatch(original, patches.flat()))
  })

  it('deletes a nested object property', function() {
    const original = { user: { profile: { name: 'a', age: 1 } } }
    const { state, patches } = makeState(original)
    delete state.user.profile.age
    expect(state).to.deep.equal(applyPatch(original, patches.flat()))
  })

  it('supports numeric-looking keys on plain objects', function() {
    const { state, patches } = makeState({})
    state['0'] = { x: 1 }
    state['0'].x = 2
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('supports boolean and null values', function() {
    const { state, patches } = makeState({})
    state.ok = true
    state.no = false
    state.nothing = null
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('supports replacing an object with a primitive', function() {
    const { state, patches } = makeState({})
    state.x = { y: 1 }
    state.x = 5
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('supports replacing a primitive with an object (deep proxying)', function() {
    const { state, patches } = makeState({})
    state.x = 5
    state.x = { y: 1 }
    state.x.y = 2
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })
})
