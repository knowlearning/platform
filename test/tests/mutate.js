export default function () {
  describe('Mutable State', function () {
    // TODO: test clearing a runstate

    it('Sets new fields and values when starting from empty object', async function () {
      const id = uuid()
      const state = await Agent.state(id)
      const newValues = { a: 1, b: 2, c: 3 }

      expect(state).to.deep.equal({})
      Object.assign(state, newValues)

      const finalState = await Agent.state(id)
      expect(finalState).to.deep.equal(newValues)
    })

    it('Deletes fields as expected', async function () {
      const id = uuid()
      const state = await Agent.state(id)

      const oldValues = { a: 1, b: 2, c: 3 }
      Object.assign(state, oldValues)

      Object.keys(state).forEach(key => delete state[key])

      const newValues = { arr: [1, 2, 3] }
      Object.assign(state, newValues)

      const finalState = await Agent.state(id)
      expect(finalState).to.deep.equal(newValues)
    })

    it('Appends values to existing arrays', async function () {
      const id = uuid()
      const state = await Agent.state(id)

      Object.assign(state, { arr: [1, 2, 3] })
      state.arr.push(4)

      const expectedValues = { arr: [1, 2, 3, 4] }
      const finalState = await Agent.state(id)
      expect(finalState).to.deep.equal(expectedValues)
    })

    it('Removes values from existing arrays', async function () {
      const id = uuid()
      const state = await Agent.state(id)

      Object.assign(state, { arr: [1, 2, 3] })
      state.arr.splice(1, 1)

      const expectedValues = { arr: [1, 3] }
      const finalState = await Agent.state(id)
      expect(finalState).to.deep.equal(expectedValues)
    })

    it('Can persist mutations on nested objects', async function () {
      const id = uuid()
      const state = await Agent.state(id)
      state.testObj = {}
      state.testObj.testVal = 1000
      const resultState = await Agent.state(id)
      expect(resultState).to.deep.equal({ testObj: { testVal: 1000 } })
    })

    it('Cannot nest same mutable object at different paths', async function () {
      const id = uuid()
      const state = await Agent.state(id)
      state.testObj = {}
      let causedError = null
      try { state.secondTestObjectReference = state.testObj }
      catch (error) { causedError = error }
      expect(causedError).to.not.equal(null)
    })

    it('Gets empty object in place of null', async function () {
      const id = uuid()
      const state = await Agent.state(id)
      expect(state).to.deep.equal({})
    })

    it('Can reset a scope', async function () {
      const id = uuid()
      const state = await Agent.state(id)
      const newValues = { a: 1, b: 2, c: 3 }

      expect(state).to.deep.equal({})
      Object.assign(state, newValues)
      Agent.reset(id)

      const resetState = await Agent.state(id)
      expect(resetState).to.deep.equal({})
    })
  })
}
