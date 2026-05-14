import YAML from 'yaml'

const domainAgentConfigured = (id, agent=Agent) => new Promise(r => agent.watch(id, u => {
  const firstLog = u.state.tasks?.agent?.[1] || ''
  const secondLog = u.state.tasks?.agent?.[1] || ''
  if (secondLog && (secondLog === 'done' || secondLog.startsWith('ERROR:'))) r()
}))

export default async function configureDomain(domain, configuration, agent=Agent) {
  const config = YAML.parse(configuration)
  const report = agent.uuid()

  const configState = await agent.state(`configuration/${domain}`)

  Object.assign(configState, config)
  await agent.response() //  TODO: investigate why awaiting synced here results in 'Throws error on permission violation' test timeout
  configState.deployment = report
  await agent.response()


  if (config.agent) await domainAgentConfigured(report, agent)

  await new Promise(resolve => {
    agent.watch(report, ({ state }) => {
      if (state.end || state.error) resolve()
    }, 'localhost:5111', 'localhost:5111')
  })

  return report
}
