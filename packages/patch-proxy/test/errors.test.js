import { expect } from 'chai'
import PatchProxy from '../index.js'

describe('Errors and constraints', function() {
  it('throws when setting a property to undefined', function() {
    const patches = []
    const state = new PatchProxy({}, p => patches.push(p))

    expect(() => {
      state.x = undefined
    }).to.throw(/undefined/i)

    expect(patches.flat()).to.deep.equal([])
  })

  it('throws when using array copyWithin (not implemented)', function() {
    const patches = []
    const state = new PatchProxy({ a: [1, 2, 3] }, p => patches.push(p))

    expect(() => {
      state.a.copyWithin(0, 1)
    }).to.throw(/copyWithin/i)
  })

  it('throws if the same object is added to multiple mutable parents', function() {
    const patches = []
    const root = new PatchProxy({ a: {}, b: {} }, p => patches.push(p))

    root.a.child = { x: 1 }

    expect(() => {
      root.b.child = root.a.child
    }).to.throw(/multiple mutable parents/i)
  })

  it('throws if you try to PatchProxy a state already proxied elsewhere', function() {
    const patches = []
    const a = new PatchProxy({}, p => patches.push(p))
    expect(() => {
      // a is already a proxy, attempting to proxy it again should trip the WeakSet check
      new PatchProxy(a, p => patches.push(p))
    }).to.throw()
  })
})
