import YAML from 'yaml'

const SIMPLE_RESPONSE_CONFIG = `
sideEffects:
  script: |
    console.log('Doing simple response config test...')
    await new Promise(r => setTimeout(r, 100))
    return 'expected simple response'
`

async function configure(domain, configuration, awaitInitialized) {
  const config = YAML.parse(configuration)
  const report = uuid()

  const configState = await Agent.state(`configuration/${domain}`)

  console.log('config state...', configState)

  Object.assign(configState, config)
  console.log('about to sync')
  await Agent.synced()
  console.log('synced 1')
  await Agent.synced()
  console.log('synced 2')
  configState.deployment = report
  await pause(10)
  await Agent.synced()
  console.log('synced 3', awaitInitialized)

  return report
}

export default function () {
  describe('New Domain Agent', function () {
    it('Gets expected response', async function () {
      const { domain } = await Agent.environment()
      console.log('CONFIGURING...')
      const report = await configure(domain, SIMPLE_RESPONSE_CONFIG, true)
      console.log('CONFIGUREDDDD...', report)
      const x = await Agent.state('hmmm')
      x.a = 100
      const r = await Agent.response()
      expect(r.response).to.equal('expected simple response')
      console.log('response.....', r)
    })
  })
}