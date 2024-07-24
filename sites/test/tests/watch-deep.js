export default function () {
  describe('Deep Watchers', function () {

    it(
      'Can watch references inside of scopes',
      async function () {
        const id = uuid()
        await Agent.create({ id, active: { x: { y: { z: 100 } } } })
        const expectedValues = [100, 200, 300, 400]
        const seenValues = []

        await Agent.synced()
        await pause()
        Agent.watch([id, 'x', 'y', 'z'], v => seenValues.push(v))

        const state = await Agent.state(id)

        state.x.y.z += 100

        await pause()
        state.x.y.z += 100
        await pause()
        state.x.y.z += 100
        while (seenValues.length < expectedValues.length) await pause(10)

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
        const id2State = await Agent.state(id2)

        const expectedValues = ['woooo!', 'wooooooooooo!x2']
        const seenValues = []

        Agent.watch([id1, 'id_referencing_other_scope', 'x'], v => {
          seenValues.push(v)
          if (seenValues.length === 1) id2State.x = 'wooooooooooo!x2'
        })

        while (seenValues.length < expectedValues.length) await pause(10)

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

        while (seenValues.length < expectedValues.length) await pause(10)

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
          console.log('SEEEEEEEEEEEEEEN', seenValues)
          if (seenValues.length === 1) {
            id3State.x = 'bye bye!'
            id2State.reference_to_short_circuit = { x: 'zap!' }
          }
        })

        while (seenValues.length < expectedValues.length) await pause(10)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )

    it(
      'References into undefined values resolve as undefined',
      async function () {
        const id1 = uuid()
        const id2 = uuid()
        const id3 = uuid()

        await Agent.create({ id: id1, active: { id_referencing_other_scope: id2 } })
        await Agent.create({ id: id2, active: { reference_to_short_circuit: id3 } })
        await Agent.create({ id: id3, active: { x: 'woooo!' } })

        const expectedValues = [undefined]
        const seenValues = []

        Agent.watch([id1, 'id_referencing_other_scope', 'reference_to_short_circuit', 'x', 'does not exist', 'really does not exist'], v => {
          seenValues.push(v)
        })

        while (seenValues.length < expectedValues.length) await pause(10)

        expect(seenValues).to.deep.equal(expectedValues)
      }
    )
  })
}
