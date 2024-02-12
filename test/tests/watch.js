export default function () {
  describe('Watchers', function () {
/*
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
          .watch(id, async update => {
            updateOrder.push(update.ii)
            if (updateOrder.length === expectedUpdateOrder.length) {
              await new Promise(r => setTimeout(r, 10))
              resolveExpectedUpdates()
            }
          })

        await Agent.synced()
        state.x = 1
        await pause()
        state.y = 2
        await pause()
        state.z = 3
        await pause()
        await expectedUpdatesPromise

        expect(updateOrder).to.deep.equal(expectedUpdateOrder)
      }
    )
*/
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
        await Agent.synced()

        Agent.watch(id, update => seenValues.push(update.state) )

        while (seenValues.length < expectedValues.length) await pause(10)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )
/*
    async function testMultiAgentWatch(agentA, agentB, scope) {
      const start = Date.now()
      const state = await agentA.state(scope)
      state.x = 100
      const expectedValues = [{ x: 100 }]
      const seenValues = []

      const { auth: { user }, domain } = await agentA.environment()
      agentB.watch(scope, update => {
        seenValues.push(update.state)
      }, user, domain)

      while (seenValues.length < expectedValues.length) {
        if (Date.now() - start > 1500) throw new Error('Timeout')
        await pause(10)
      }

      expect(seenValues).to.deep.equal(expectedValues)
    }

    it(
      "Allows users to watch own scopes by id",
      async function () {
        await testMultiAgentWatch(Agent, Agent, uuid())
      }
    )

    it(
      "Allows users to watch other user's scopes by id",
      async function () {
        await testMultiAgentWatch(Agent, Agent2, uuid())
        await testMultiAgentWatch(Agent2, Agent, uuid())
      }
    )

    it(
      "Allows users to watch own scopes by name",
      async function () {
        await testMultiAgentWatch(Agent, Agent, `asdf-${uuid()}`)
      }
    )

    it(
      "Allows users to watch other user's scopes by name",
      async function () {
        await testMultiAgentWatch(Agent, Agent2, `asdf-${uuid()}`)
        await testMultiAgentWatch(Agent2, Agent, `asdf-${uuid()}`)
      }
    )

    it(
      'Allows watching paths',
      async function () {
        const expectedStates = [{}, { x: 1 }, { x: 2 }, { x: 1003 }]
        const stateUpdates = []

        let resolveExpectedUpdates
        const expectedUpdatesPromise = new Promise(r => resolveExpectedUpdates = r)

        const id = uuid()
        const state = await Agent.state(id)
        Agent
          .watch([id], async state => {
            stateUpdates.push(state)
            if (stateUpdates.length === expectedStates.length) {
              await new Promise(r => setTimeout(r, 10))
              resolveExpectedUpdates()
            }
          })

        await Agent.synced()
        state.x = 1
        await pause()
        state.x = 2
        await pause()
        state.x = 1003
        await expectedUpdatesPromise

        expect(stateUpdates).to.deep.equal(expectedStates)
      }
    )

    it(
      'Can make a second watch request to the same scope and get a result',
      async function () {
        const id = uuid()
        const start = Date.now()
        const state = await Agent.state(id)
        state.x = 100
        const expectedValues = [{ x: 100 }]
        const seenValues1 = []
        const seenValues2 = []

        const { auth: { user }, domain } = await Agent.environment()

        const unwatch = Agent.watch(id, update => {
          seenValues1.push(update.state)
        }, user, domain)

        Agent.watch(id, update => {
          seenValues2.push(update.state)
        }, user, domain)

        while (seenValues1.length < expectedValues.length || seenValues2.length < expectedValues.length) {
          if (Date.now() - start > 1500) throw new Error('Timeout')
          await pause(10)
        }

        expect(seenValues1).to.deep.equal(expectedValues)
        expect(seenValues1).to.deep.equal(seenValues2)

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
            .watch(id, update => {
              updatesSeen += 1
              if (updatesSeen === EXPECTED_UPDATES) resolveThirdUpdate()
            })
        )

        await Agent.synced()
        state.x = 1
        await pause()
        state.y = 2
        await pause()
        state.z = 3

        // unwatch after 1 update
        await thirdUpdatePromise
        unwatch()

        let resolveAfterUnwatchPromise
        let rejectAfterUnwatchPromise
        const finalUpdatesPromise = new Promise((res, rej) => {
          resolveAfterUnwatchPromise = res
          rejectAfterUnwatchPromise = rej
        })

        const expectedValues = {x:2,y:3,z:4}
        Object.assign(state, expectedValues)

        //  set up another watcher
        const EXPECTED_AFTER_WATCH_UPDATES = 1
        let afterUnwatchUpdates = 0
        const finalStatePromise = Agent.state(id)
        const unwatch2 = Agent.watch(id, update => {
          afterUnwatchUpdates += 1
          if (afterUnwatchUpdates === 1) resolveAfterUnwatchPromise()
        })

        await finalUpdatesPromise
        unwatch2()
        state.a = 101


        const finalState = await finalStatePromise
        expect(finalState).to.deep.equal(expectedValues)

        await new Promise(r => setTimeout(r, 10))

        //  make sure first watcher didn't get any other updates
        expect(updatesSeen).to.equal(EXPECTED_UPDATES)
        expect(afterUnwatchUpdates).to.equal(EXPECTED_AFTER_WATCH_UPDATES)
      }
    )
*/
  })
}
