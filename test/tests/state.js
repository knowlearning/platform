export default function () {
  describe('Get and Set States', function () {
    // TODO: test clearing a runstate

    it('Can set a state, then retrieve the updated state', async function () {
      const id = uuid()

      const state = await Agent.state(id)
      state.x = 100
      state.y = 200

      const firstAgentRetrievedState = await Agent.state(id)
      const secondAgentRetrievedState = await Agent2.state(id)

      expect(firstAgentRetrievedState).to.deep.equal(state)
      expect(state).to.deep.equal(secondAgentRetrievedState)
    })

    it('Can set a named state, then retrieve the updated named state', async function () {
      const id = uuid()
      const name = `Special State ${id}`

      const agent1Env = await Agent.environment()

      const secondAgentRetrievedState1 = await Agent2.state(name, agent1Env.auth.user)

      const state = await Agent.state(name)
      state.x = 100
      state.y = 200

      const firstAgentRetrievedState = await Agent.state(name)
      expect(firstAgentRetrievedState).to.deep.equal(state)

      const secondAgentRetrievedState = await Agent2.state(name, agent1Env.auth.user)
      expect(secondAgentRetrievedState).to.deep.equal(state)

      state.z = 1000
      await pause(100)

      const thirdAgentRetrievedState = await Agent2.state(name, agent1Env.auth.user)

      expect(state).to.deep.equal(thirdAgentRetrievedState)
    })
  })
}
