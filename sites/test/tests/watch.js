const EMBEDED_WATCHER_TEST_MODE = 'EMBEDED_WATCHER_TEST_MODE'

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

    it(
      'Gets the expected number of updates when requesting with explicit current user id and state name',
      async function () {
        const expectedUpdateOrder = [0, 1, 2, 3]
        const updateOrder = []

        let resolveExpectedUpdates
        const expectedUpdatesPromise = new Promise(r => resolveExpectedUpdates = r)

        const id = `state-name-${uuid()}`
        const { auth: { user } } = await Agent.environment()
        const state = await Agent.state(id, user)
        Agent
          .watch(id, async update => {
            updateOrder.push(update.ii)
            if (updateOrder.length === expectedUpdateOrder.length) {
              await new Promise(r => setTimeout(r, 10))
              resolveExpectedUpdates()
            }
          }, user)

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

    it('Can watch updates for named scope', async function () {
      const name = 'test-' + Agent.uuid()
      const s = await Agent.state(name)
      let resolve, reject
      const p = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      let update = 0
      const { auth: { user }, domain } = await Agent.environment()
      Agent.watch(name, async u => {
        update += 1
        if (update > 4) reject()
        if (update === 4) {
          await new Promise(r => setTimeout(r, 100))
          resolve()
        }
      })
      await Agent.synced()
      s.x = 1
      await pause()
      s.x = 2
      await pause()
      s.x = 3
      await pause()

      await p
    })

    it('Can embed an app that successfully watches a scope controlled from above', async function () {
      const id = uuid()
      let resolve
      const done = new Promise(r => resolve = r)
      const state = await Agent2.state(id)
      const metadata = await Agent2.metadata(id)
      const firstExpectedUpdates = [{x:1}, {x:1, y:2}, {x:1, y:2, z:3}, {x:1, y:2, z:3, done: true}]
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)
      state.x = 1

      const { on } = Agent.embed({ id, mode: EMBEDED_WATCHER_TEST_MODE }, iframe)

      let closeInfo
      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      on('open', async () => {
        await Agent.synced()
        state.y = 2
        await pause()
        state.z = 3
        await pause()
        state.done = true
      })

      await done
      expect(closeInfo).to.deep.equal(firstExpectedUpdates)
    })

    it('Can embed, close, then re-embed an app that watches the same scope', async function () {
      const id = uuid()
      let resolve
      const done = new Promise(r => resolve = r)
      const state = await Agent2.state(id)
      const metadata = await Agent2.metadata(id)
      const firstExpectedUpdates = [{x:1}, {x:1, y:2}, {x:1, y:2, z:3}, {x:1, y:2, z:3, done: true}]
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)
      state.x = 1

      const { on } = Agent.embed({ id, mode: EMBEDED_WATCHER_TEST_MODE }, iframe)

      let closeInfo
      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        state.done = false
        resolve()
      })

      on('open', async () => {
        await Agent.synced()
        state.y = 2
        await pause()
        state.z = 3
        await pause()
        state.done = true
      })

      await done
      expect(closeInfo).to.deep.equal(firstExpectedUpdates)


      const secondExpectedUpdates = [{x:1, y:2, z:3, done: false}, {x:2, y:2, z:3, done: false}, {x:2, y:3, z:3, done: false}, {x:2, y:3, z:4, done: false}, {x:2, y:3, z:4, done: true}]

      let resolve2
      const done2 = new Promise(r => resolve2 = r)

      const iframe2 = document.createElement('iframe')
      iframe2.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe2)

      const { on:on2 } = Agent.embed({ id, mode: EMBEDED_WATCHER_TEST_MODE }, iframe2)

      let closeInfo2
      on2('close', info => {
        closeInfo2 = info
        document.body.removeChild(iframe2)
        resolve2()
      })

      on2('open', async () => {
        await Agent.synced()
        state.x += 1
        await pause()
        state.y += 1
        await pause()
        state.z += 1
        await pause()
        state.done = true
      })

      await done2
      expect(closeInfo2).to.deep.equal(secondExpectedUpdates)
    })
  })
}
