import YAML from 'yaml'

const MIRROR_FIELD_DOMAIN = 'mirror-field.localhost:5112'

const mirrorFieldConfig = `
  sideEffects:
    script: |
      patch.forEach(async op => {
        if (op.path.length === 2 && op.path[1] === 'mirror') {
          const state = await Agent.state(scope)
          state.mirror = op.value
        }
      })
`
const toMirrorFieldConfig = `
  sideEffects:
    script: |
      patch.forEach(async op => {
        if (op.path.length === 2 && op.path[1] === 'mirror') {
          const MirrorAgent = getAgent('${MIRROR_FIELD_DOMAIN}')
          const state = await MirrorAgent.state(scope)
          state.mirror = op.value
        }
      })
`

async function configure(domain, configuration, awaitInitialized) {
  const config = YAML.parse(configuration)
  const report = Agent.uuid()

  const configState = await Agent.state(`configuration/${domain}`)

  Object.assign(configState, config)
  await Agent.synced()
  configState.deployment = report
  await pause(10)
  await Agent.synced()

  return report
}

export default function () {

  const mirrorFieldDomainConfigured = configure(MIRROR_FIELD_DOMAIN, mirrorFieldConfig)

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

    it('Can work with domains connected to each other', async function () {
      this.timeout(3000)
      await mirrorFieldDomainConfigured
      await configure('localhost:5112', toMirrorFieldConfig)
      const id = `x-${Agent.uuid()}`
      const state = await Agent.state(id)
      const dataToMirror = Agent.uuid()
      state.mirror = dataToMirror
      let resolve

      Agent
        .watch(
          id,
          update => update.state.mirror === dataToMirror && resolve(),
          'localhost:5112',
          MIRROR_FIELD_DOMAIN
        )

      await new Promise(r => resolve = r)
    })
  })

}