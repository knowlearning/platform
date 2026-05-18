import configureDomain from '../utils/configure-domain.js'

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
      for (const op of patch) {
        if (op.path.length === 1 && op.path[0] === 'mirror') {
          const state = await Agent.state(scope)
          state.mirror = op.value
          await Agent.synced()
        }
      }
`
const mirrorFieldConfig2 = `
  sideEffects:
    script: |
      for (const op of patch) {
        if (op.path.length === 1 && op.path[0] === 'mirror') {
          const state = await Agent.state(scope)
          state.mirror = op.value + '2'
          await Agent.synced()
        }
      }
`
const toMirrorFieldConfig = `
  sideEffects:
    script: |
      for (const op of patch) {
        if (op.path.length === 1 && op.path[0] === 'mirror') {
          const MirrorAgent = getAgent('${MIRROR_FIELD_DOMAIN}')
          const state = await MirrorAgent.state(scope)
          state.mirror = op.value
          await MirrorAgent.synced()
        }
      }
`

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
      await configureDomain(domain, BROKEN_SYNTAX_CONFIG)
      const x = await Agent.state(Agent.uuid())
      x.a = 100
      const response = await Agent.response()
      expect(response.log).to.deep.equal(['SyntaxError: Unexpected identifier \'syntax\''])
    })

    it('Is resilient against broken side effect scripts (runtime)', async function () {
      const { domain } = await Agent.environment()
      await configureDomain(domain, BROKEN_RUNTIME_CONFIG)
      const x = await Agent.state(Agent.uuid())
      x.a = 100
      const response = await Agent.response()
      expect(response.log).to.deep.equal(['ReferenceError: runtimeError is not defined'])
    })

    it('Gets expected responses after reconfigurations', async function () {
      for (let i=0; i<3; i++) {
        this.timeout(5000)
        const response = Agent.uuid()
        const { domain } = await Agent.environment()
        await configureDomain(domain, getSimpleResponseConfig(response))
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
      await configureDomain(domain, stateSettingConfig)
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
      await configureDomain(domain, stateSettingConfig)
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
      await configureDomain(domain, stateSettingConfig)
      const x = await Agent.state('x')
      x.asdf = 1
      const { response: { ii } } = await Agent.response()
      expect(ii).to.equal(4)
    })

    it('Allows domain agents (configured) to connect to each other', async function () {
      this.timeout(3000)
      await configureDomain('localhost:5112', toMirrorFieldConfig)
      await configureDomain(MIRROR_FIELD_DOMAIN, mirrorFieldConfig)
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
      await configureDomain('localhost:5112', toMirrorFieldConfig)
      await configureDomain(MIRROR_FIELD_DOMAIN, mirrorFieldConfig2)
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

    it('Throws error on permission violation', async () => {
      const config = `
        sideEffects:
          script: |
            //  This tries to import index.js from core/source/domain-worker/
            await import('../index.js')
            return 'success'
      `
      await configureDomain('localhost:5112', config)
      const state = await Agent.state(Agent.uuid())
      state.x = 100
      const { response, log } = await Agent.response()
      expect(response).to.not.equal('success')
      expect(log.length).to.equal(1)
      expect(log[0]).to.equal('TypeError: Requires read access to "/source/index.js", run again with the --allow-read flag')
    })

    it('Sends back improperly encoded secrets as null', async () => {
      const config = `
        secrets:
          improperly_encoded_secret: GPAXy5QiOSuZ41cTZaEbkFhZgvF/H1tIJ0xYxOCiQwKQFtlQer1x40RhsQAcTGwdNgOft4SgDhDOEOqjaP0pnKauKS3YCev9W72461CI+ebtjqV4FFIuSHTQUKDK44TZ
        sideEffects:
          script: |
            const { secrets } = await Agent.environment()
            return secrets.improperly_encoded_secret
      `
      await configureDomain('localhost:5112', config)
      const state = await Agent.state(Agent.uuid())
      state.x = 100
      const { response, log } = await Agent.response()
      console.log('RESPONSE', response, log)
      expect(response).to.equal(null)
    })

    it('makes properly encoded secrets available to worker scripts', async () => {
      const config = `
        secrets:
          properly_encoded_secret: Y6OvsoSoSQlkbEe7TwlmIAIaDJMOFtFo52Xy/ioJNT1tPrlvszdDF2OMJ57N5+pAgmLh2WOadvLBNHqQnM3QHnN47p4cnoRwWQCsGn6cawmkhd4=
        sideEffects:
          script: |
            const { secrets } = await Agent.environment()
            return secrets.properly_encoded_secret
      `
      await configureDomain('localhost:5112', config)
      const state = await Agent.state(Agent.uuid())
      state.x = 100
      const { response, log } = await Agent.response()
      console.log('RESPONSE', response, log)
      expect(response).to.equal('notsosecret')
    })
  })

}
