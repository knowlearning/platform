const EMBEDED_WATCHER_TEST_MODE = 'EMBEDED_WATCHER_TEST_MODE'

export default function latestBugfixes() {
  describe('Latest Bugfixes', function () {
    it('Can await Agent.synced twice in a row', async function () {
      const x = await Agent.state(Agent.uuid())
      await Agent.synced()
      x.whatever = 1
      await Agent.synced()
    })
  })
}