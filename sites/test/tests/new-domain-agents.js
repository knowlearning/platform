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
  const getSimpleResponseConfig = response => `
  sideEffects:
    script: |
      console.log('Doing simple response config test...')
      await new Promise(r => setTimeout(r))
      return '${response}'
  `

  describe('New Domain Agent', function () {
    it('Gets expected responses after reconfigurations', async function () {
      for (let i=0; i<3; i++) {
        this.timeout(5000)
        const response = Agent.uuid()
        const { domain } = await Agent.environment()
        const report = await configure(domain, getSimpleResponseConfig(response), true)
        const x = await Agent.state(Agent.uuid())
        x.a = 100
        const r = await Agent.response()
        expect(r.response).to.equal(response)
      }
    })
  })

}