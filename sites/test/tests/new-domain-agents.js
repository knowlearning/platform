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

    it('Sets state properly and gets expected response', async function () {
      const stateId = Agent.uuid()
      const stateSettingConfig = `
        sideEffects:
          script: |
            const id = '${stateId}'
            const state = await Agent.state(id)
            state.myOwnId = id
      `
      const { domain } = await Agent.environment()
      await configure(domain, stateSettingConfig, true)
      await Agent.state()
      const x = await Agent.state(stateId)
      expect(x.myOwnId).to.equal(stateId)
    })

    it('Sets state properly and gets expected response', async function () {
      const stateId = Agent.uuid()
      const stateSettingConfig = `
        sideEffects:
          script: |
            return Agent.environment().then(e => e.domain)
      `
      const { domain } = await Agent.environment()
      await configure(domain, stateSettingConfig, true)
      const x = await Agent.state('x')
      x.asdf = 1
      const { response } = await Agent.response()
      expect(response).to.equal(domain)
    })

    it('Metadata reflects proper interaction index', async function () {
      const stateId = Agent.uuid()
      const state = await Agent.state(stateId)
      state.interact = 1
      await pause()
      state.interact = 2
      await pause()
      state.interact = 3
      await pause()
      state.interact = 4
      const stateSettingConfig = `
        sideEffects:
          script: |
            return Agent.metadata('${stateId}')
      `
      const { domain } = await Agent.environment()
      await configure(domain, stateSettingConfig, true)
      const x = await Agent.state('x')
      x.asdf = 1
      const { response: { ii } } = await Agent.response()
      expect(ii).to.equal(4)
    })
  })

}