import YAML from 'yaml'

const SIMPLE_RESPONSE_CONFIG = `
sideEffects:
  script: |
    console.log('Doing simple response config test...')
    await new Promise(r => setTimeout(r, 100))
    return 'expected simple response'
`

const domainAgentConfigured = id => new Promise(r => Agent.watch(id, u => {
  if (u.state.tasks?.agent?.[1] === 'done') r()
}))
const domainAgentInitialized = id => new Promise(r => Agent.watch(id, u => {
  if (u.state.tasks?.agent?.[0]) r()
}))

async function configure(domain, configuration, awaitInitialized) {
  const config = YAML.parse(configuration)
  const report = uuid()

  const configState = await Agent.state(`configuration/${domain}`)

  Object.assign(configState, config)
  await Agent.synced()
  await Agent.synced()
  configState.deployment = report
  await pause(10)
  await Agent.synced()

  awaitInitialized ? await domainAgentInitialized(report) : await domainAgentConfigured(report)
  return report
}

export default function () {
  describe('New Domain Agent', function () {
    it('Gets expected response', async function () {
      const { domain } = await Agent.environment()
      await configure(domain, SIMPLE_RESPONSE_CONFIG)
    })
  })
}