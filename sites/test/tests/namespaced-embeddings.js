const EMBEDED_SCOPE_NAMESPACE_TEST_MODE = 'EMBEDED_SCOPE_NAMESPACE_TEST_MODE'
const EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE = 'EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE'

export default function latestBugfixes() {
  describe('Namespaced Embedded State', function () {
    it('Forces embedded frames state requests to have namespaces', async function () {
      const id = uuid()
      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const namespace = `some-random-namespace-${id}`

      const namespaceIncludedReference = await Agent.state(`${namespace}/some-namespaced-scope-name`)
      namespaceIncludedReference.someData = uuid()

      await Agent.synced()

      const { on } = Agent.embed({
        id,
        mode: EMBEDED_SCOPE_NAMESPACE_TEST_MODE,
        namespace
      }, iframe)

      let closeInfo
      let updatedNamespaceIncludedReference
      on('open', () => {
        namespaceIncludedReference.modified = true
      })
      on('close', async info => {
        closeInfo = info
        updatedNamespaceIncludedReference = await Agent.state(`${namespace}/some-namespaced-scope-name`)
        document.body.removeChild(iframe)
        resolve()
      })

      await done

      expect(closeInfo).to.deep.equal(updatedNamespaceIncludedReference)
    })

    it('Allows embedded frames state requests to have allowed prefixes to namespaces', async function () {
      const id = uuid()
      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const namespace = `some-random-namespace-${id}`

      const namespaceIncludedReference = await Agent.state(`${namespace}/some-namespaced-scope-name`)
      namespaceIncludedReference.someData = uuid()

      await Agent.synced()

      const { on } = Agent.embed({
        id,
        mode: EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE,
        namespace: {
          prefix: namespace,
          allow: ['this-avoids-namespacing']
        },
      }, iframe)

      let closeInfo
      let updatedNamespaceIncludedReference
      let updatedNamespaceNotIncludedReference
      on('open', async () => {
        console.log('MODIFIEDDDD', namespaceIncludedReference, await Agent.metadata(`${namespace}/some-namespaced-scope-name`))
        namespaceIncludedReference.modified = true
      })
      on('close', async info => {
        closeInfo = info
        updatedNamespaceIncludedReference = await Agent.state(`${namespace}/some-namespaced-scope-name`)
        updatedNamespaceNotIncludedReference = await Agent.state(`this-avoids-namespacing/some-namespaced-scope-name`)
        document.body.removeChild(iframe)
        resolve()
      })

      await done

      expect(closeInfo.namespacedState).to.deep.equal(updatedNamespaceIncludedReference)
      expect(closeInfo.unnamespacedState).to.deep.equal(updatedNamespaceIncludedReference)
    })
  })
}