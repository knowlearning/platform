export default function () {
  describe('Get and Set States', function () {
    // TODO: test clearing a runstate

    it('Can set a state, then retrieve the updated state', async function () {
      const id = uuid()

      const state = await Agent.state(id)
      state.x = 100
      state.y = 200

      const firstAgentRetrievedState = await Agent.state(id)
      await Agent.synced()
      const secondAgentRetrievedState = await Agent2.state(id)

      expect(firstAgentRetrievedState).to.deep.equal(state)
      expect(state).to.deep.equal(secondAgentRetrievedState)
    })

    it('Can set a named state, then retrieve the updated named state', async function () {
      const id = uuid()
      const name = `Special State ${id}`

      const agent1Env = await Agent.environment()

      const state = await Agent.state(name)
      state.x = 100
      state.y = 200

      const firstAgentRetrievedState = await Agent.state(name)
      expect(firstAgentRetrievedState).to.deep.equal(state)

      await Agent.synced()
      const secondAgentRetrievedState = await Agent2.state(name, agent1Env.auth.user)
      expect(secondAgentRetrievedState).to.deep.equal(state)

      state.z = 1000

      await Agent.synced()
      const thirdAgentRetrievedState = await Agent3.state(name, agent1Env.auth.user)
      expect(thirdAgentRetrievedState).to.deep.equal(state)
    })

    it('Can update a second requested persistent object', async function () {
      const { auth: { user } } = await Agent.environment()
      const id = uuid()
      const name = `Special State ${id}`
      const state = await Agent.state(name)
      state.x = 100
      state.y = 200

      const state2 = await Agent.state(name)
      state2.x = 200
      state2.y = 400

      await Agent.synced()

      const updatedStateFromSecondAgent = await Agent2.state(name, user)

      expect(updatedStateFromSecondAgent).to.deep.equal(state2)
    })

    it('Can request two of the same states by uuid and await sync', async function () {
      const id = Agent.uuid()
      const t0 = await Agent.state(id)
      t0.y = 1
      const t1 = await Agent.state(id)
      await Agent.synced()
    })

    it('Can request two of the same states by name and await synced', async function () {
      const id = 'test'
      const t0 = await Agent.state(id)
      t0.y = 1
      const t1 = await Agent.state(id)
      //t1.hmm = 1
      await Agent.synced()
    })
  })
}
