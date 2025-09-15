import YAML from 'yaml'

const MIRROR_FIELD_DOMAIN = 'mirror-field.localhost:5112'

const BROKEN_SYNTAX_CONFIG = `
  sideEffects:
    script: |
      await async syntax error
`

const BROKEN_RUNTIME_CONFIG = `
  sideEffects:
    script: |
      runtimeError()
`

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
const mirrorFieldConfig2 = `
  sideEffects:
    script: |
      patch.forEach(async op => {
        if (op.path.length === 2 && op.path[1] === 'mirror') {
          const state = await Agent.state(scope)
          state.mirror = op.value + '2'
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
          const { auth: { user } } = await Agent.environment()
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

  return new Promise(resolve => {
    Agent.watch(report, ({ state }) => {
      if (state.end) resolve()
    }, 'localhost:5111', 'localhost:5111')
  })
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
    it('Is resilient against broken side effect scripts (syntax)', async function () {
      const { domain } = await Agent.environment()
      await configure(domain, BROKEN_SYNTAX_CONFIG)
      const x = await Agent.state(Agent.uuid())
      x.a = 100
      const response = await Agent.response()
      expect(response.errored).to.equal(true)
    })

    it('Is resilient against broken side effect scripts (runtime)', async function () {
      const { domain } = await Agent.environment()
      await configure(domain, BROKEN_RUNTIME_CONFIG)
      const x = await Agent.state(Agent.uuid())
      x.a = 100
      const response = await Agent.response()
      expect(response.errored).to.equal(true)
    })

    it('Gets expected responses after reconfigurations', async function () {
      for (let i=0; i<3; i++) {
        this.timeout(5000)
        const response = Agent.uuid()
        const { domain } = await Agent.environment()
        await configure(domain, getSimpleResponseConfig(response))
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
      await configure(domain, stateSettingConfig)
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
      await configure(domain, stateSettingConfig)
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
      await configure(domain, stateSettingConfig)
      const x = await Agent.state('x')
      x.asdf = 1
      const { response: { ii } } = await Agent.response()
      expect(ii).to.equal(4)
    })

    it('Allows domain agents (configured) to connect to each other', async function () {
      this.timeout(3000)
      await configure('localhost:5112', toMirrorFieldConfig)
      await configure(MIRROR_FIELD_DOMAIN, mirrorFieldConfig)
      const scope = `x-${Agent.uuid()}`
      const state = await Agent.state(scope)
      const dataToMirror = Agent.uuid()
      state.mirror = dataToMirror

      return new Promise(resolve => {
        Agent
          .watch(
            scope,
            update => {
              console.log('hmmm', update.state)
              if (update.state.mirror === dataToMirror) resolve()
            },
            MIRROR_FIELD_DOMAIN,
            MIRROR_FIELD_DOMAIN
          )
      })
    })

    it('Allows domain agents (reconfigured) to connect to each other', async function () {
      this.timeout(3000)
      await configure('localhost:5112', toMirrorFieldConfig)
      await configure(MIRROR_FIELD_DOMAIN, mirrorFieldConfig2)
      await pause(1000)
      const scope = `x-${Agent.uuid()}`
      const state = await Agent.state(scope)
      const dataToMirror = Agent.uuid()
      state.mirror = dataToMirror
      let resolve

      return new Promise(resolve => {
        Agent
          .watch(
            scope,
            update => {
              if (update.state.mirror === dataToMirror + '2') resolve()
            },
            MIRROR_FIELD_DOMAIN,
            MIRROR_FIELD_DOMAIN
          )
      })
    })
  })

}