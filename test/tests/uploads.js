export default function () {
  describe('Uploads and downloads', function () {
    const id = uuid()

    function uploadPatch(fileId, name='Replay upload') {
      return [
        { op: 'add', path: ['active_type'], value: 'application/json;type=upload' },
        { op: 'add', path: ['active'], value: { id: fileId, type: 'text/plain', name } }
      ]
    }

    async function requestUpload(requestId, fileId, name) {
      await Agent.state(requestId)
      return Agent.interact(requestId, uploadPatch(fileId, name))
    }

    async function putUpload(url, data) {
      const response = await fetch(url, {
        method: 'PUT',
        headers: { 'Content-Type': 'text/plain' },
        body: data
      })
      expect(response.ok).to.equal(true)
    }

    async function uploadSnapshot(fileId) {
      const state = JSON.parse(JSON.stringify(await Agent.state(fileId)))
      const metadata = await Agent.metadata(fileId)
      return {
        state,
        ii: metadata.ii,
        updated: metadata.updated,
        active_type: metadata.active_type,
        external: metadata.external,
        name: metadata.name
      }
    }

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

    for (const withData of [true, false]) {
      it(`Rejects a failed public ${withData ? 'data upload' : 'upload URL request'} and permits the next upload`, async function () {
        let error

        try {
          await Agent.upload({
            id: 'not-a-uuid',
            name: 'Rejected upload',
            type: 'text/plain',
            data: withData ? 'This upload must be rejected' : undefined
          })
        }
        catch (cause) { error = cause }

        expect(error?.error || error?.message || error).to.equal('ERROR PROCESSING MESSAGE')
        await Agent.synced()

        const fileId = uuid()
        const data = 'Upload after a rejected request'
        const uploadedId = await Agent.upload({ id: fileId, type: 'text/plain', data })

        expect(uploadedId).to.equal(fileId)
        expect(await Agent.download(fileId).then(response => response.text())).to.equal(data)
        await Agent.synced()
      })
    }

    it('Replaying a completed upload preserves its object and metadata', async function () {
      const requestId = uuid()
      const fileId = uuid()
      const original = await requestUpload(requestId, fileId)
      await putUpload(original.url, 'Completed upload')
      const snapshot = await uploadSnapshot(fileId)

      for (let replay = 0; replay < 3; replay++) {
        const response = await requestUpload(requestId, fileId)
        expect(new URL(response.url).pathname).to.equal(new URL(original.url).pathname)
        expect(await uploadSnapshot(fileId)).to.deep.equal(snapshot)
        expect(await Agent.download(fileId).then(response => response.text())).to.equal('Completed upload')
      }
    })

    it('Replaying before the PUT reuses the original upload allocation', async function () {
      const requestId = uuid()
      const fileId = uuid()
      const original = await requestUpload(requestId, fileId)
      const snapshot = await uploadSnapshot(fileId)
      const replay = await requestUpload(requestId, fileId)

      expect(new URL(replay.url).pathname).to.equal(new URL(original.url).pathname)
      expect(await uploadSnapshot(fileId)).to.deep.equal(snapshot)
      await putUpload(replay.url, 'Uploaded after recovering the allocation')
      expect(await Agent.download(fileId).then(response => response.text())).to.equal('Uploaded after recovering the allocation')
    })

    it('Overlapping requests for one upload wrapper share an allocation', async function () {
      const requestId = uuid()
      const fileId = uuid()
      await Agent.state(requestId)
      const original = Agent.interact(requestId, uploadPatch(fileId))
      await new Promise(resolve => setTimeout(resolve))
      const replay = Agent.interact(requestId, uploadPatch(fileId))
      const responses = await Promise.all([original, replay])

      expect(new URL(responses[1].url).pathname).to.equal(new URL(responses[0].url).pathname)
      expect((await Agent.metadata(fileId)).ii).to.equal(1)
      await putUpload(responses[0].url, 'One allocation for overlapping requests')
      expect(await Agent.download(fileId).then(response => response.text())).to.equal('One allocation for overlapping requests')
    })

    it('A new upload wrapper can replace a file without changing the previous object', async function () {
      const fileId = uuid()
      const original = await requestUpload(uuid(), fileId, 'Original upload')
      await putUpload(original.url, 'Original content')
      const originalDownload = await Agent.download(fileId).url()
      const replacementId = uuid()
      const replacement = await requestUpload(replacementId, fileId, 'Replacement upload')

      expect(new URL(replacement.url).pathname).not.to.equal(new URL(original.url).pathname)
      await putUpload(replacement.url, 'Replacement content')
      const snapshot = await uploadSnapshot(fileId)
      const replay = await requestUpload(replacementId, fileId, 'Replacement upload')

      expect(new URL(replay.url).pathname).to.equal(new URL(replacement.url).pathname)
      expect(await uploadSnapshot(fileId)).to.deep.equal(snapshot)
      expect(await Agent.download(fileId).then(response => response.text())).to.equal('Replacement content')
      expect(await fetch(originalDownload).then(response => response.text())).to.equal('Original content')
    })

    it('Rejecting a superseded upload replay preserves the newer file', async function () {
      if (Agent.embedded) this.skip()

      const requestId = uuid()
      const fileId = uuid()
      const original = await requestUpload(requestId, fileId)
      await putUpload(original.url, 'Original content')
      const replacement = await requestUpload(uuid(), fileId, 'Newer upload')
      await putUpload(replacement.url, 'Newer content')
      const snapshot = await uploadSnapshot(fileId)
      const interaction = Agent.interact(requestId, uploadPatch(fileId), false)
      const response = Agent.response()
      let error

      try { await Promise.all([interaction, response]) }
      catch (cause) { error = cause }

      expect(error).to.exist
      expect(await uploadSnapshot(fileId)).to.deep.equal(snapshot)
      expect(await Agent.download(fileId).then(response => response.text())).to.equal('Newer content')
    })

    it('Preserves a completed replacement upload after the reconnect grace period', async function () {
      if (Agent.embedded || new URL(window.location.href).searchParams.get('uploadReplaySoak') !== '1') this.skip()
      this.timeout(90000)

      const fileId = uuid()
      const originalId = uuid()
      const replacementId = uuid()
      const original = await requestUpload(originalId, fileId, 'Original upload')
      await putUpload(original.url, 'Original content')
      const originalDownload = await Agent.download(fileId).url()
      const replacement = await requestUpload(replacementId, fileId, 'Replacement upload')
      await putUpload(replacement.url, 'Replacement content')
      const replacementDownload = await Agent.download(fileId).url()
      await Agent.synced()

      Agent.disconnect()
      try { await pause(65200) }
      finally { await Agent.reconnect() }

      const barriers = await Promise.all([
        Agent.interact(originalId, [], false),
        Agent.interact(replacementId, [], false)
      ])
      expect(barriers.map(response => response.ii)).to.deep.equal([3, 3])
      const download = await Agent.download(fileId).url()
      expect(new URL(download).pathname).to.equal(new URL(replacementDownload).pathname)
      expect(await fetch(download).then(response => response.text())).to.equal('Replacement content')
      expect(await fetch(originalDownload).then(response => response.text())).to.equal('Original content')

      const response = await Agent.interact(uuid(), [
        { op: 'add', path: ['active'], value: { continued: true } }
      ], false)
      expect(response.ii).to.equal(1)
      await Agent.synced()
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
