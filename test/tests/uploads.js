export default function () {
  describe('Uploads and downloads', function () {
    const id = uuid()
    it('Can upload and download', async function () {
      const testData = '{"test":"data"}'
      await Agent.upload({
        name: 'Upload name',
        type: 'application/json',
        data: testData,
        id
      })
      const downloadedData = await Agent.download(id).then(r => r.text())
      expect(testData).to.equal(downloadedData)
    })

    it('Can download state history for a non-upload state', async function () {
      this.timeout(10000)

      const id = uuid()
      const state = await Agent.state(id)
      state.favoriteNumber = 42
      await Agent.synced()

      state.nested = {}
      await Agent.synced()

      state.nested.label = 'history'
      await Agent.synced()

      const downloadedHistory = await Agent.download(id).then(r => r.text())
      const lines = downloadedHistory.trim().split('\n')
      const patches = lines.map(line => JSON.parse(line.slice(line.indexOf(' ') + 1)))

      expect(lines).to.have.length(3)
      expect(patches[0]).to.deep.equal([{ op: 'add', path: ['favoriteNumber'], value: 42 }])
      expect(patches[1]).to.deep.equal([{ op: 'add', path: ['nested'], value: {} }])
      expect(patches[2]).to.deep.equal([{ op: 'add', path: ['nested', 'label'], value: 'history' }])
    })
  })
}
