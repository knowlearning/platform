const EMBEDDED_ENVIRONMENT_TEST_MODE = 'EMBEDDED_ENVIRONMENT_TEST_MODE'

export default function environmentTest() {
  describe('Environment calls', function () {

    it('Can be proxied for embedded apps', async function () {
      const passedDownEnvironmentInfo = { auth: { user: uuid(), provider: 'whatever', info: { name: 'anything' } }, variables: { WHATEVER: 'whatevs' } }
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

    it('Transfers added environment variables to children', async function () {
      const environment = await Agent.environment()
      environment.variables.WHAT_I_WANT = 'Woo!'

      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let passedBackEnvironment

      await new Promise(resolve => {
        on('close', info => {
          passedBackEnvironment = info
          document.body.removeChild(iframe)
          resolve()
        })
      })

      delete environment.context
      delete environment.mode
      delete passedBackEnvironment.context
      delete passedBackEnvironment.mode

      expect(passedBackEnvironment).to.deep.equal(environment)
    })

    it('Transfers updated variable values to children', async function () {
      const environment = await Agent.environment()
      environment.variables.LANGUAGES = ['not a language']

      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let passedBackEnvironment

      await new Promise(resolve => {
        on('close', info => {
          passedBackEnvironment = info
          document.body.removeChild(iframe)
          resolve()
        })
      })

      delete environment.context
      delete environment.mode
      delete passedBackEnvironment.context
      delete passedBackEnvironment.mode

      console.log(environment, passedBackEnvironment)

      expect(passedBackEnvironment).to.deep.equal(environment)
    })

    it('Transfers updated array variable values to children', async function () {
      const environment = await Agent.environment()
      environment.variables.LANGUAGES.push('still not a language')

      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let passedBackEnvironment

      await new Promise(resolve => {
        on('close', info => {
          passedBackEnvironment = info
          document.body.removeChild(iframe)
          resolve()
        })
      })

      delete environment.context
      delete environment.mode
      delete passedBackEnvironment.context
      delete passedBackEnvironment.mode

      console.log(environment, passedBackEnvironment)

      expect(passedBackEnvironment).to.deep.equal(environment)
    })

    it('Transfers re-updated variable values to children', async function () {
      const environment = await Agent.environment()
      environment.variables.LANGUAGES = ['not at all a language']

      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: uuid(), mode: EMBEDDED_ENVIRONMENT_TEST_MODE }, iframe)

      let passedBackEnvironment

      await new Promise(resolve => {
        on('close', info => {
          passedBackEnvironment = info
          document.body.removeChild(iframe)
          resolve()
        })
      })

      delete environment.context
      delete environment.mode
      delete passedBackEnvironment.context
      delete passedBackEnvironment.mode

      console.log(environment, passedBackEnvironment)

      expect(passedBackEnvironment).to.deep.equal(environment)
    })

  })
}