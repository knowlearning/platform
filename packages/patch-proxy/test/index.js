import { expect } from 'chai'
import PatchProxy from '../index.js'
import { applyPatch } from './utils.js'

describe("Construct patch sets", function() {

  it("Can set numeric state and emit expected patch", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.x = 100
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can set numeric state then delete it", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.x = 100
    delete state.x
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can set arrays of primitive values", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['this', 'is']
    state.myArray.push('PRIMITIVE!')
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can set arrays of object types", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = [{ this: 'this' }, { is: 'happens to be' }]
    state.myArray.push({ complex: 'more harder' })
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can unshift arrays of object types", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = [{ this: 'this' }, { is: 'happens to be' }]
    state.myArray.unshift({ complex: 'more harder' })
    state.myArray.unshift({ complex: 'even more harder' })
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can unshift arrays of mixed object and primitive types", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.unshift({ complex: 'more harder' })
    state.myArray.unshift({ complex: 'even more harder' })
    state.myArray.unshift({ complex: 'even even more harder' }, { complex: 'even even more harder x2' })
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
    expect(state.myArray.length).to.equal(7)
  })

  it("Can shift arrays of mixed object and primitive types", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.shift()
    state.myArray.shift()
    state.myArray.shift()
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
    expect(state.myArray.length).to.equal(0)
  })

  it("Can splice arrays of mixed object and primitive types", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1, 1, { x: 'wooo' })
    state.myArray.splice(1, 0, { x: 'wooot' })
    expect({ myArray: ['hmmm', { x: 'wooot' }, { x: 'wooo' }, 'hmmm'] })
      .to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can splice arrays and write into child content at modified index", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm']
    state.myArray.splice(1, 1, { x: 'wooo' })
    state.myArray.splice(1, 0, { x: 'wooot' })
    state.myArray[2].x = 'Woot woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can shift arrays and write into child content at modified index", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm', { that: 'hmmm' }]
    state.myArray.shift()
    state.myArray[0].x = 'Woot woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can unshift arrays and write into child content at modified index", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['hmmm', { this: 'this' }, 'hmmm', { that: 'hmmm' }]
    state.myArray.unshift({}, { x: 100 }, { y: 32 })
    state.myArray[4].x = 'Woot woot'
    state.myArray[0].p = 'Whoopie'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can reverse arrays and write into child content at modified index", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = ['1', { this: '2' }, 3, { that: '4' }]
    state.myArray.reverse()
    state.myArray[0].that = 'whoooopie!'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can sort arrays", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = [5,3,3,1,43,64,3,128,8,4,8,4]
    state.myArray.sort()
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

  it("Can sort arrays and write into child content at modified index", function() {
    const  patches = []
    const state = new PatchProxy({}, patch => patches.push(patch))
    state.myArray = [{ number: 1},{ number: 5},{ number: 3 }]
    state.myArray.sort((a, b) => a.number - b.number)
    state.myArray[1].moreInfo = 'woot'
    expect(state).to.deep.equal(applyPatch({}, patches.flat()))
  })

})