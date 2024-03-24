export default function () {
  let orignalEnv
  describe('Session Reconnections', function () {
    it(
      'Re-establishes connection after disconnection and reconnection to same server',
      async function() {
        this.timeout(5000)

        orignalEnv = await Agent.environment()

        const id = uuid()
        const state = await Agent.state(id)

        await pause(10)
        state.x = 1
        await pause(10)
        state.y = 2
        await pause(10)
        state.z = 3
        await pause(10)

        Agent.disconnect()

        await pause(10)
        state.x = 2
        await pause(10)
        state.y = 3
        await pause(10)
        state.z = 4
        await pause(10)

        Agent.reconnect()

        const finalState = await Agent.state(id)
        expect(finalState).to.deep.equal({x:2,y:3,z:4})
        const { auth: { user, provider } } = await Agent.environment()
        expect(orignalEnv.auth.user).to.equal(user)
        expect(orignalEnv.auth.provider).to.equal(provider)
      }
    )

    //  TODO: test subscription reattachment after server switch
    it (
      'Re-attaches to subscriptions after disconnection and reconnection to same server',
      async function () {
        this.timeout(5000)

        const prevEnv = await Agent.environment()
        expect(orignalEnv.auth.user).to.equal(prevEnv.auth.user)
        expect(orignalEnv.auth.provider).to.equal(prevEnv.auth.provider)

        const id = uuid()
        const expectedUpdates = 10
        let numUpdates = 0

        const state = await Agent.state(id)

        Agent.watch(id, update => numUpdates += 1)

        await pause(10)
        state.x = 1
        await pause(10)
        state.y = 2
        await pause(10)
        state.z = 3
        await pause(10)

        Agent.disconnect()

        await pause(100)
        state.x = 2
        await pause(10)
        state.y = 3
        await pause(10)
        state.z = 4
        await pause(10)

        Agent.reconnect()

        await pause(10)
        state.x = 3
        await pause(10)
        state.y = 4
        await pause(10)
        state.z = 5
        await pause(10)


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

        const postEnv = await Agent.environment()
        console.log('ORIGINAL ENV, POST ENV', orignalEnv, postEnv)
        expect(orignalEnv.auth.user).to.equal(postEnv.auth.user)
        expect(orignalEnv.auth.provider).to.equal(postEnv.auth.provider)
      }
    )
  })
}