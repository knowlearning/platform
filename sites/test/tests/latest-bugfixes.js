const EMBEDED_WATCHER_TEST_MODE = 'EMBEDED_WATCHER_TEST_MODE'

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
          .query('does-not-exist-and-not-authorized',[], 'example.knowlearning.systems')
          .then(result => unexpectedResult = result)
          .catch(e => {
            erroredExpectedly = true
            error = e
          })
      if (!erroredExpectedly) throw new Error(`Expected auth error on query; received unexpected result: ${unexpectedResult}`)
    })

  })
}
