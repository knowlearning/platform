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

        Agent.watch(id, async ({state}) => seenValues.push(state))

        await new Promise(r => setTimeout(r, 50))
        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'Can watch references inside of scopes',
      async function () {
        const id = uuid()
        await Agent.create({ id, active: { x: { y: { z: 100 } } } })
        const expectedValues = [100, 200, 300, 400]
        const seenValues = []

        Agent.watch([id, 'x', 'y', 'z'], v => seenValues.push(v))

        const state = await Agent.state(id)

        state.x.y.z += 100

        await pause()
        state.x.y.z += 100
        await pause()
        state.x.y.z += 100
        await pause(50)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'Can watch references embedded 1 level within a scope',
      async function () {
        const id1 = uuid()
        const id2 = uuid()

        await Agent.create({ id: id1, active: { id_referencing_other_scope: id2 } })
        await Agent.create({ id: id2, active: { x: 'woooo!' } })

        const expectedValues = ['woooo!', 'wooooooooooo!x2']
        const seenValues = []

        Agent.watch([id1, 'id_referencing_other_scope', 'x'], v => seenValues.push(v))

        const id2State = await Agent.state(id2)
        id2State.x = 'wooooooooooo!x2'

        await new Promise(r => setTimeout(r, 50))

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'Can watch references embedded 2 levels within scopes',
      async function () {
        const id1 = uuid()
        const id2 = uuid()
        const id3 = uuid()

        await Agent.create({ id: id1, active: { id_referencing_other_scope: id2 } })
        await Agent.create({ id: id2, active: { id_referencing_other_other_scope: id3 } })
        await Agent.create({ id: id3, active: { x: 'woooo!' } })

        const expectedValues = ['woooo!', 'wooooooooooo!x2']
        const seenValues = []


        const id3State = await Agent.state(id3)

        Agent.watch([id1, 'id_referencing_other_scope', 'id_referencing_other_other_scope', 'x'], v => {
          seenValues.push(v)
          if (seenValues.length === 1) id3State.x = 'wooooooooooo!x2'
        })

        await new Promise(r => setTimeout(r, 50))

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'Can short circuit deep watchers',
      async function () {
        const id1 = uuid()
        const id2 = uuid()
        const id3 = uuid()

        await Agent.create({ id: id1, active: { id_referencing_other_scope: id2 } })
        await Agent.create({ id: id2, active: { reference_to_short_circuit: id3 } })
        await Agent.create({ id: id3, active: { x: 'woooo!' } })

        const expectedValues = ['woooo!', 'bye bye!', 'zap!']
        const seenValues = []

        const id2State = await Agent.state(id2)
        const id3State = await Agent.state(id3)

        Agent.watch([id1, 'id_referencing_other_scope', 'reference_to_short_circuit', 'x'], v => {
          seenValues.push(v)
          if (seenValues.length === 1) {
            id3State.x = 'bye bye!'
            id2State.reference_to_short_circuit = { x: 'zap!' }
          }
        })

        await new Promise(r => setTimeout(r, 50))

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
