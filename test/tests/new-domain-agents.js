import configureDomain from '../utils/configure-domain.js'
import browserAgent from '@knowlearning/agents/browser/initialize.js'

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

const CRASH_WORKER_CONFIG = `
  sideEffects:
    script: |
      globalThis.Deno.exit(42)
`

const HANGING_WORKER_CONFIG = `
  sideEffects:
    script: |
      await new Promise(() => {})
`

const SERIAL_SIDE_EFFECT_CONFIG = `
  sideEffects:
    script: |
      if (scope !== 'queue-writes' && scope !== 'queue-control') return
      const audit = globalThis.queueAudit ||= { active: 0, maximum: 0, released: false }
      if (scope === 'queue-control') {
        if (patch.some(operation => operation.path[0] === 'release')) {
          audit.released = true
          audit.release?.()
        }
        return { active: audit.active }
      }
      const sequence = patch.find(operation => operation.path[0] === 'sequence').value
      audit.active += 1
      audit.maximum = Math.max(audit.maximum, audit.active)
      try {
        if (sequence === 0 && !audit.released) await new Promise(resolve => { audit.release = resolve })
        else await new Promise(resolve => setTimeout(resolve, 30))
        return { sequence, maximum: audit.maximum }
      }
      finally { audit.active -= 1 }
`

const QUERY_QUEUE_CONFIG = `
  postgres:
    queries:
      queue-blocking-query: SELECT 1 AS value
      queue-following-query: SELECT 2 AS value
  sideEffects:
    script: |
      const audit = globalThis.queryQueueAudit ||= { started: false, released: false }
      if (scope === 'queue-control') {
        if (patch.some(operation => operation.path[0] === 'release')) {
          audit.released = true
          audit.release?.()
        }
        return { started: audit.started, released: audit.released }
      }
      if (scope !== 'sessions') return
      if (!patch.some(operation => operation.path[1] === 'queries' && operation.value?.query === 'queue-blocking-query')) return
      audit.started = true
      if (!audit.released) await new Promise(resolve => { audit.release = resolve })
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
    it('Serializes a same-scope burst through delayed domain side effects', async function () {
      this.timeout(10000)

      const queueAgent = browserAgent({
        unique: true,
        root: true,
        domain: `promise-queue-${Agent.uuid()}.localhost:5112`,
        apiHost: localStorage.getItem('API_HOST'),
        getToken: () => 'anonymous'
      })
      const responses = [], responseOrder = []
      let control

      try {
        const { domain } = await queueAgent.environment()
        await configureDomain(domain, SERIAL_SIDE_EFFECT_CONFIG)
        const state = await queueAgent.state('queue-writes')
        control = await queueAgent.state('queue-control')
        const enqueue = sequence => {
          state.sequence = sequence
          responses.push(queueAgent.response().then(result => {
            responseOrder.push(result.response.sequence)
            return result
          }))
        }

        enqueue(0)
        let status
        const deadline = Date.now() + 3000
        do {
          control.probe = Agent.uuid()
          status = (await queueAgent.response()).response
          if (status.active === 1) break
          await pause(10)
        } while (Date.now() < deadline)
        expect(status.active).to.equal(1)

        const expectedOrder = Array.from({ length: 8 }, (value, index) => index)
        for (const sequence of expectedOrder.slice(1)) {
          enqueue(sequence)
          await pause()
        }
        control.release = Agent.uuid()
        await queueAgent.response()

        const results = await Promise.all(responses)
        expect(responseOrder).to.deep.equal(expectedOrder)
        expect(results.map(result => result.response.sequence)).to.deep.equal(expectedOrder)
        expect(results.map(result => result.response.maximum)).to.deep.equal(expectedOrder.map(() => 1))
      }
      finally {
        if (control) {
          control.release = Agent.uuid()
          await queueAgent.response()
          await Promise.allSettled(responses)
        }
        queueAgent.disconnect?.()
      }
    })

    it('Continues session queries while an earlier query side effect is pending', async function () {
      this.timeout(10000)
      const queueAgent = browserAgent({
        unique: true,
        root: true,
        domain: `query-queue-${Agent.uuid()}.localhost:5112`,
        apiHost: localStorage.getItem('API_HOST'),
        getToken: () => 'anonymous'
      })
      let control, following, timer

      try {
        const { domain } = await queueAgent.environment()
        await configureDomain(domain, QUERY_QUEUE_CONFIG)
        control = await queueAgent.state('queue-control')
        expect(await queueAgent.query('queue-blocking-query')).to.deep.equal([{ value: 1 }])

        let status
        const deadline = Date.now() + 3000
        do {
          control.probe = Agent.uuid()
          status = (await queueAgent.response()).response
          if (status.started) break
          await pause(10)
        } while (Date.now() < deadline)
        expect(status).to.deep.equal({ started: true, released: false })

        following = queueAgent.query('queue-following-query')
        const rows = await Promise.race([
          following,
          new Promise((resolve, reject) => { timer = setTimeout(() => reject(new Error('Later query blocked behind domain effects')), 3000) })
        ])
        expect(rows).to.deep.equal([{ value: 2 }])
      }
      finally {
        clearTimeout(timer)
        if (control) {
          control.release = Agent.uuid()
          await queueAgent.response()
          await Promise.allSettled([following])
        }
        queueAgent.disconnect?.()
      }
    })

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

    it('Returns an error response and recovers when a side effect worker exits', async function () {
      const { domain } = await Agent.environment()
      await configureDomain(domain, CRASH_WORKER_CONFIG)

      const crashed = await Agent.state(Agent.uuid())
      crashed.a = 100

      const crashResponse = await Agent.response()
      expect(crashResponse.log).to.deep.equal(['Worker exited with code 42'])

      const response = Agent.uuid()
      await configureDomain(domain, getSimpleResponseConfig(response))

      const recovered = await Agent.state(Agent.uuid())
      recovered.a = 100

      const recoveredResponse = await Agent.response()
      expect(recoveredResponse.response).to.equal(response)
    })

    it('Returns an error response and recovers when a side effect worker refreshes with pending work', async function () {
      this.timeout(10000)

      const domain = `refresh-worker-${Agent.uuid()}.localhost:5112`
      const workerAgent = browserAgent({
        unique: true,
        domain,
        apiHost: process.env.API_HOST || 'socket-io.localhost:8765',
        getToken: () => 'anonymous'
      })
      const refreshAgent = browserAgent({
        unique: true,
        domain,
        apiHost: process.env.API_HOST || 'socket-io.localhost:8765',
        getToken: () => 'anonymous'
      })

      const withTimeout = (promise, message) => Promise.race([
        promise,
        new Promise((_, reject) => setTimeout(() => reject(new Error(message)), 3000))
      ])

      try {
        await Promise.all([
          workerAgent.environment(),
          refreshAgent.environment()
        ])
        const hangingState = await workerAgent.state(Agent.uuid())
        const recoveredState = await refreshAgent.state(Agent.uuid())

        await configureDomain(domain, HANGING_WORKER_CONFIG)

        hangingState.a = 100
        const hangingResponse = withTimeout(
          workerAgent.response(),
          'Timed out waiting for refreshed worker error response'
        )
        await new Promise(resolve => setTimeout(resolve, 100))

        const recoveredResponse = Agent.uuid()
        await configureDomain(domain, getSimpleResponseConfig(recoveredResponse))

        recoveredState.a = 200

        const refreshResponse = await hangingResponse
        expect(refreshResponse.log).to.deep.equal(['Worker refreshed before completing request'])

        const nextResponse = await withTimeout(
          refreshAgent.response(),
          'Timed out waiting for refreshed worker recovery response'
        )
        expect(nextResponse.response).to.equal(recoveredResponse)
      }
      finally {
        workerAgent.disconnect?.()
        refreshAgent.disconnect?.()
      }
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
      expect(log[0]).to.equal('TypeError: Requires read access to "/workspace/core/source/index.js", run again with the --allow-read flag')
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
