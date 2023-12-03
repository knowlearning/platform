const EMBEDDED_ENVIRONMENT_TEST_MODE = 'EMBEDDED_ENVIRONMENT_TEST_MODE'

export default function environmentTest() {
  describe('Environment calls', function () {

    it('Can be proxied for embedded apps', async function () {
      const passedDownEnvironmentInfo = { auth: { user: uuid(), provider: 'whatever', info: { name: 'anything' } } }
      let resolve, reject
      const done = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let passedBackEnvironmentInfo
      let environmentCalledFromEmbedded

      on('environment', () => {
        environmentCalledFromEmbedded = true
        return passedDownEnvironmentInfo
      })

      on('close', info => {
        environmentCalledFromEmbedded ? resolve() : reject('Agent.environment() not called before close')
        passedBackEnvironmentInfo = info
        document.body.removeChild(iframe)
      })

      await done

      //  remove expected additions by middleware
      delete passedBackEnvironmentInfo.context
      delete passedBackEnvironmentInfo.mode

      expect(passedBackEnvironmentInfo).to.deep.equal(passedDownEnvironmentInfo)
    })

  })
}