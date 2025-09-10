import YAML from 'yaml'
import { v4 as uuid } from 'uuid'

async function configure(domain, configuration, awaitInitialized) {
  const config = YAML.parse(configuration)
  const report = uuid()

  const configState = await Agent.state(`configuration/${domain}`)

  Object.assign(configState, config)
  await Agent.synced()
  configState.deployment = report
  await pause(10)
  await Agent.synced()

  return report
}

export default function () {
  const SIMPLE_RESPONSE = uuid()

  const SIMPLE_RESPONSE_CONFIG = `
  sideEffects:
    script: |
      console.log('Doing simple response config test...')
      await new Promise(r => setTimeout(r, 100))
      return '${SIMPLE_RESPONSE}'
  `

  describe('New Domain Agent', function () {
    it('Gets expected response', async function () {
      const { domain } = await Agent.environment()
      const report = await configure(domain, SIMPLE_RESPONSE_CONFIG, true)
      const x = await Agent.state('hmmm')
      x.a = 100
      const r = await Agent.response()
      expect(r.response).to.equal(SIMPLE_RESPONSE)
      console.log('response.....', r)
    })
  })
}