import { browserAgent } from '@knowlearning/agents'

export default function () {
  const checkAgent = browserAgent()
  describe('Array Manipulations', function () {
    // TODO: test clearing a runstate

    it('Can splice', async function () {
      const id = uuid()

      const state = await Agent.state(id)
      state.x = [1,2,3,4,5]
      state.x.splice(2, 1)
      const retrievedState = await checkAgent.state(id)

      expect(retrievedState.x).to.deep.equal(state.x)
    })
  })
}
