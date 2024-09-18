export default function latestBugfixes() {
  describe('Latest Bugfixes', function () {

    it('Allows watching before grabbing state', async function () {
      const expectedUpdateOrder = [0, 1, 2, 3]
      const updateOrder = []

      let resolveExpectedUpdates
      const expectedUpdatesPromise = new Promise(r => resolveExpectedUpdates = r)

      const id = uuid()
      Agent
        .watch(id, async update => {
          updateOrder.push(update.ii)
          if (updateOrder.length === expectedUpdateOrder.length) {
            await new Promise(r => setTimeout(r, 10))
            resolveExpectedUpdates()
          }
        })
      const state = await Agent.state(id)

      await Agent.synced()
      state.x = 1
      await pause()
      state.y = 2
      await pause()
      state.z = 3
      await pause()
      await expectedUpdatesPromise

      expect(updateOrder).to.deep.equal(expectedUpdateOrder)

    })


    it('History is expected length', async function () {
      const expectedUpdateOrder = [0, 1, 2, 3]
      const updateOrder = []

      let resolveExpectedUpdates
      const expectedUpdatesPromise = new Promise(r => resolveExpectedUpdates = r)
      let resolveFirstUpdate
      const firstUpdatePromise = new Promise(r => resolveFirstUpdate = r)


      const id = uuid()
      Agent
        .watch(id, async update => {
          resolveFirstUpdate()
          updateOrder.push(update.ii)
          if (updateOrder.length === expectedUpdateOrder.length) {
            await new Promise(r => setTimeout(r, 10))
            resolveExpectedUpdates()
          }
        })
      const state = await Agent.state(id)

      await firstUpdatePromise
      state.x = 1
      await pause()
      state.y = 2
      await pause()
      state.z = 3
      await pause()
      await expectedUpdatesPromise

      expect(updateOrder).to.deep.equal(expectedUpdateOrder)

      const historyLength = await (
        Agent
          .history(id)
          .then(blob => blob.text())
          .then(text => text.split('\n').length - 1)
      )

      expect(historyLength).to.equal(4)

    })


  })
}