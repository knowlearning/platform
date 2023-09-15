export default function () {
  describe('Session Reconnections', function () {
    it(
      'Re-establishes connection after disconnection and reconnection to same server',
      async function() {
        this.timeout(5000)

        const id = uuid()
        const state = await Agent.state(id)

        state.x = 1
        state.y = 2
        state.z = 3

        Agent.disconnect()

        state.x = 2
        state.y = 3
        state.z = 4

        Agent.reconnect()

        const finalState = await Agent.state(id)
        expect(finalState).to.deep.equal({x:2,y:3,z:4})
      }
    )
    //  TODO: test subscription reattachment after server switch
    it (
      'Re-attaches to subscriptions after disconnection and reconnection to same server',
      async function () {
        this.timeout(5000)

        const id = uuid()
        const expectedUpdates = 10
        let numUpdates = 0

        const state = await Agent.state(id)
        const statePromise = Agent.state(id)

        Agent.watch(id, update => numUpdates += 1)

        state.x = 1
        state.y = 2
        state.z = 3

        Agent.disconnect()

        state.x = 2
        state.y = 3
        state.z = 4

        Agent.reconnect()

        state.x = 3
        state.y = 4
        state.z = 5

        const finalState = await Agent.state(id)
        expect(finalState).to.deep.equal({x:3,y:4,z:5})

        //  updates that go through pub-sub might take longer to travel back than a subsequent state call
        //  TODO: consider sending updates to agent listenrs outside of redis pubsub for clients
        //        who made the updates. That could guarantee update response orders come down interleaved
        //        as might be expected based on order of updates and calls for state
        while (numUpdates < expectedUpdates) {
          await new Promise(r => setTimeout(r, 100))
        }

        expect(numUpdates).to.equal(expectedUpdates)
      }
    )
  })
}