const EMBEDDED_ENVIRONMENT_TEST_MODE = 'EMBEDDED_ENVIRONMENT_TEST_MODE'

export default function environmentTest() {
  describe('Environment calls', function () {

    it('Can be made from embedded app', async function () {
      const passedEnvironmentInfo = uuid()
      let resolve, reject
      const done = new Promise((res, rej) => {
        resolve = res
        reject = rej
      })
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let closeInfo

      on('environment', () => resolve(passedEnvironmentInfo))

      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        reject('Environment not called before close')
      })

      await done

      expect(closeInfo).to.equal(passedEnvironmentInfo)
    })

  })
}