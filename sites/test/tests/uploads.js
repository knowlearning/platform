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
  })
}
