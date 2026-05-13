import YAML from 'yaml'

const domainAgentConfigured = id => new Promise(r => Agent.watch(id, u => {
  const firstLog = u.state.tasks?.agent?.[1] || ''
  const secondLog = u.state.tasks?.agent?.[1] || ''
  if (secondLog && (secondLog === 'done' || secondLog.startsWith('ERROR:'))) r()
}))

export default async function configureDomain(domain, configuration) {
  const config = YAML.parse(configuration)
  const report = Agent.uuid()

  const configState = await Agent.state(`configuration/${domain}`)

  Object.assign(configState, config)
  await Agent.response() //  TODO: investigate why awaiting synced here results in 'Throws error on permission violation' test timeout
  configState.deployment = report
  await Agent.response()


  if (config.agent) await domainAgentConfigured(report)

  await new Promise(resolve => {
    Agent.watch(report, ({ state }) => {
      if (state.end || state.error) resolve()
    }, 'localhost:5111', 'localhost:5111')
  })

  return report
}
