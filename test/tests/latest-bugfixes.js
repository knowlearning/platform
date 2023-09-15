export default function latestBugfixes() {
  describe('Latest Bugfixes', function () {
    it('Can request two of the same states by uuid and await sync', async function () {
      const id = Agent.uuid()
      const t0 = await Agent.state(id)
      t0.y = 1
      const t1 = await Agent.state(id)
      await Agent.synced()
    })

    it('Can watch updates for named scope', async function () {
      const name = 'test-' + Agent.uuid()
      const s = await Agent.state(name)
      let resolve, reject
      const p = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      let update = 0
      Agent.watch(name, async u => {
        update += 1
        if (update > 4) reject()
        if (update === 4) {
          await new Promise(r => setTimeout(r, 300))
          resolve()
        }
      })
      s.x = 1
      s.x = 2
      s.x = 3

      await p
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