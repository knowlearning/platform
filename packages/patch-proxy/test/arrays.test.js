import { expect } from 'chai'
import { makeState } from './helpers.js'
import { applyPatch } from './utils.js'

describe('Arrays', function() {
  it('sets an array and pushes primitives', function() {
    const { state, patches } = makeState({})
    state.myArray = ['this', 'is']
    state.myArray.push('PRIMITIVE!')
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('sets an array and pushes objects, then edits the pushed object', function() {
    const { state, patches } = makeState({})
    state.myArray = [{ a: 1 }]
    state.myArray.push({ b: 2 })
    state.myArray[1].b = 3
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('unshift with objects updates indices and allows editing moved children', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm', { that: 'hmmm' }]
    state.myArray.unshift({}, { x: 100 }, { y: 32 })
    state.myArray[4].x = 'Woot woot'
    state.myArray[0].p = 'Whoopie'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('shift removes from front and allows editing now-at-0 child', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm', { that: 'hmmm' }]
    state.myArray.shift()
    state.myArray[0].x = 'Woot woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice with 0 args is a no-op', function() {
    const { state, patches } = makeState({})
    state.myArray = [1, 2, 3]
    state.myArray.splice()
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice with 1 arg deletes to end', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1)
    expect({ myArray: ['hmmm'] }).to.deep.equal(applyPatch({}, patches.flat()))
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice with 2 args deletes bounded by array length', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1, 10000)
    expect({ myArray: ['hmmm'] }).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice with Infinity deleteCount deletes to end', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1, Infinity)
    expect({ myArray: ['hmmm'] }).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice insert-only (deleteCount 0) inserts and keeps later children editable', function() {
    const { state, patches } = makeState({})
    state.myArray = [{ n: 1 }, { n: 3 }]
    state.myArray.splice(1, 0, { n: 2 })
    state.myArray[2].n = 4
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('splice replace then insert then edit at modified index', function() {
    const { state, patches } = makeState({})
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1, 1, { x: 'wooo' })
    state.myArray.splice(1, 0, { x: 'wooot' })
    state.myArray[2].x = 'Woot woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('reverse emits moves and keeps child paths consistent for edits', function() {
    const { state, patches } = makeState({})
    state.myArray = ['1', { this: '2' }, 3, { that: '4' }]
    state.myArray.reverse()
    state.myArray[0].that = 'whoooopie!'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('sort with primitives emits moves', function() {
    const { state, patches } = makeState({})
    state.myArray = [5, 3, 3, 1, 43, 64, 3, 128, 8, 4, 8, 4]
    state.myArray.sort()
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('sort with comparator keeps child paths consistent for edits', function() {
    const { state, patches } = makeState({})
    state.myArray = [{ number: 1 }, { number: 5 }, { number: 3 }]
    state.myArray.sort((a, b) => a.number - b.number)
    state.myArray[1].moreInfo = 'woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('setting a numeric index directly works (add/replace)', function() {
    const { state, patches } = makeState({})
    state.myArray = []
    state.myArray[0] = { x: 1 }
    state.myArray[0].x = 2
    state.myArray[0] = { x: 3 }
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it('array non-index props do not emit patches', function() {
    const { state, patches } = makeState({})
    state.myArray = [1, 2]
    state.myArray.custom = { x: 1 }
    state.myArray.custom.x = 2
    expect(patches.flat().some(p => p.path?.includes('custom'))).to.equal(false)
  })
})
