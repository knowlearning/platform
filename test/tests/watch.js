function pause(ms) {
  return new Promise(r => setTimeout(r, ms))
}

export default function () {
  describe('Watchers', function () {

    it(
      'Gets the expected number of updates',
      async function () {
        const expectedUpdateOrder = [0, 1, 2, 3]
        const updateOrder = []

        let resolveExpectedUpdates
        const expectedUpdatesPromise = new Promise(r => resolveExpectedUpdates = r)

        const id = uuid()
        const state = await Agent.state(id)
        Agent
          .watch(id, async ({ ii }) => {
            updateOrder.push(ii)
            if (updateOrder.length === expectedUpdateOrder.length) {
              await new Promise(r => setTimeout(r, 10))
              resolveExpectedUpdates()
            }
          })

        await pause()
        state.x = 1
        await pause()
        state.y = 2
        await pause()
        state.z = 3
        await expectedUpdatesPromise

        expect(updateOrder).to.deep.equal(expectedUpdateOrder)
      }
    )

    it(
      'Triggers callback for initial watch once',
      async function () {
        const id = uuid()
        const state = await Agent.create({
          id,
          active: { x: 100 }
        })
        const expectedValues = [{ x: 100 }]
        const seenValues = []

        Agent.watch(id, ({state}) => seenValues.push(state))

        while (seenValues.length < expectedValues.length) await pause(10)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      "Allows users to watch other user's named states",
      async function () {
        const id = uuid()
        const scopeName =`asdf-${id}`
        const state = await Agent.state(scopeName)
        state.x = 100
        const expectedValues = [{ x: 100 }]
        const seenValues = []

        //  TODO: figure out how to fix situationwhere 2 of the same expected values will
        //        return if we don't sync here
        const { auth: { user: user1 } } = await Agent.environment()
        const { auth: { user: user2 } } = await Agent2.environment()

        expect(user1).to.not.equal(user2)
        await Agent.synced()

        Agent2.watch(scopeName, ({state}) => seenValues.push(state), user1)

        console.log('Agent 1', user1)
        console.log('Agent 2', user2)
        console.log('Agent 1 State', await Agent.state(scopeName, user1))
        console.log('Agent 2 State', await Agent2.state(scopeName, user1))

        while (seenValues.length < expectedValues.length) await pause(10)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'Closes a listening connection after a close call',
      async function () {
        this.timeout(5000)

        const EXPECTED_UPDATES = 3
        const id = uuid()
        const state = await Agent.state(id)
        let updatesSeen = 0

        let resolveThirdUpdate
        const thirdUpdatePromise = new Promise(r => resolveThirdUpdate = r)

        // set up one watcher
        const unwatch = (
          Agent
            .watch(id, (update) => {
              updatesSeen += 1
              if (updatesSeen === EXPECTED_UPDATES) resolveThirdUpdate()
            })
        )

        await pause()
        state.x = 1
        await pause()
        state.y = 2
        await pause()
        state.z = 3

        // unwatch after 3 updates
        await thirdUpdatePromise
        unwatch()

        let resolveAfterUnwatchPromise
        const finalUpdatesPromise = new Promise(r => resolveAfterUnwatchPromise = r)

        const expectedValues = {x:2,y:3,z:4}
        Object.assign(state, expectedValues)

        //  set up another watcher
        let afterUnwatchUpdates = 0
        const finalStatePromise = Agent.state(id)
        const unwatch2 = Agent.watch(id, () => {
          afterUnwatchUpdates += 1
          if (afterUnwatchUpdates === 3) resolveAfterUnwatchPromise()
        })
        await finalUpdatesPromise
        unwatch2()

        const finalState = await finalStatePromise
        expect(finalState).to.deep.equal(expectedValues)

        //  make sure first watcher didn't get any other updates
        expect(updatesSeen).to.equal(EXPECTED_UPDATES)
      }
    )

  })
}
