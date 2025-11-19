export default function latestBugfixes() {
  describe('Latest Bugfixes', function () {
    it('Can await Agent.synced twice in a row', async function () {
      const x = await Agent.state(Agent.uuid())
      await Agent.synced()
      x.whatever = 1
      await Agent.synced()
    })

    it('Surfaces error on cross domain query auth fail', async function () {
      let erroredExpectedly, error, unexpectedResult
      await
        Agent
          .query('does-not-exist-and-not-authorized',[], 'simple-mirror-config.localhost:5112')
          .then(result => unexpectedResult = result)
          .catch(e => {
            erroredExpectedly = true
            error = e
          })
      if (!erroredExpectedly) throw new Error(`Expected auth error on query; received unexpected result: ${unexpectedResult}`)
    })

    it('Properly syncs to updates from an embedded frame', async function () {
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)
      const { on } = Agent.embed({ id: 'embed_close_sync_test' }, iframe)

      let resolve
      const done = new Promise(r => resolve = r)

      on('close', async info => {
        const state = await Agent.state(info)
        document.body.removeChild(iframe)
        if (state.a !== 'expected') throw new Error('State not synced')
        else resolve()
      })

      await done
    })
  })
}
