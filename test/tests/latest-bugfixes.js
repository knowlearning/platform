function pause(ms) {
  return new Promise(r => setTimeout(r, ms))
}

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
      const { auth: { user }, domain } = await Agent.environment()
      Agent.watch(name, async u => {
        update += 1
        if (update > 4) reject()
        if (update === 4) {
          await new Promise(r => setTimeout(r, 300))
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

    it('Can request two of the same states by name and await synced', async function () {
      const id = 'test'
      const t0 = await Agent.state(id)
      t0.y = 1
      const t1 = await Agent.state(id)
      //t1.hmm = 1
      await Agent.synced()
    })

    it('Can embed an app that successfully watches a scope controlled from above', async function () {
      const id = uuid()
      let resolve
      const done = new Promise(r => resolve = r)
      const state = await Agent2.state(id)
      const metadata = await Agent2.metadata(id)
      const firstExpectedUpdates = [{x:1}, {x:1, y:2}, {x:1, y:2, z:3}, {x:1, y:2, z:3, done: true}]
      metadata.active_type = 'application/json;embed-watch-test'
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)
      const { on } = Agent.embed({ id }, iframe)

      let closeInfo
      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      on('open', async () => {
        state.x = 1
        await pause()
        state.y = 2
        await pause()
        state.z = 3
        await pause()
        state.done = true
      })

      await done
      expect(closeInfo).to.deep.equal(firstExpectedUpdates)
    })

  })
}