export default function () {
  describe('Array Manipulations', function () {
    // TODO: test clearing a runstate

    it('Can splice', async function () {
      const id = uuid()

      const state = await Agent.state(id)
      state.x = [1,2,3,4,5]
      state.x.splice(2, 1)
      await Agent.synced()
      const retrievedState = await Agent2.state(id)

      expect(retrievedState.x).to.deep.equal(state.x)
    })
  })
}
