import YAML from 'yaml'
import configureDomain from '../../utils/configure-domain.js'
import mirrorConfiguration from './simple-mirror-config.js'

const configuration = agent => YAML.stringify({ ...YAML.parse(mirrorConfiguration), agent })

async function waitForState(scope, user, domain, ready) {
  const deadline = Date.now() + 10000
  let state
  while (Date.now() < deadline) {
    state = await Agent.state(scope, user, domain)
    if (state.error) throw new Error(state.error)
    if (ready(state)) return state
    await pause(25)
  }
  throw new Error(`Timed out waiting for ${scope} in ${domain}: ${JSON.stringify(state)}`)
}

export default function () {
  it('Preserves child mutation bursts through local and cross-domain agents', async function () {
    this.timeout(30000)

    const suffix = `${Agent.uuid()}.localhost:5112`
    const receiver = `queue-receiver-${suffix}`
    const remote = `queue-remote-${suffix}`
    const sender = `queue-sender-${suffix}`
    const burstSize = 8

    try {
      await configureDomain(remote, configuration(null))
      await configureDomain(receiver, configuration(`
        import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

        const RemoteAgent = getAgent('${remote}')
        let initialize
        const ready = new Promise(resolve => { initialize = resolve })
        let received = 0
        let completed = 0

        Agent.on('child', child => {
          child.on('mutate', async mutation => {
            if (mutation.scope !== 'queue-input') return
            try {
              const sequence = mutation.patch.find(operation => operation.path[0] === 'sequence').value
              const index = received++
              const patch = [{
                op: 'add', path: ['active', 'events', index],
                value: { sequence, ii: mutation.ii }
              }]
              await ready
              const [local, remote] = await Promise.all([
                Agent.interact('queue-audit', patch),
                RemoteAgent.interact('queue-audit', patch)
              ])
              status.responses['sequence-' + sequence] = { local: local.ii, remote: remote.ii }
              status.completed = ++completed
            }
            catch (error) { status.error = String(error) }
          })
        })
        const status = await Agent.state('queue-status')
        const initial = [{ op: 'add', path: ['active'], value: { events: [] } }]
        await Agent.interact('queue-audit', initial)
        await RemoteAgent.interact('queue-audit', initial)
        status.responses = {}
        status.ready = true
        initialize()
      `))
      await waitForState('queue-status', receiver, receiver, state => state.ready)

      await configureDomain(sender, configuration(`
        import Agent, { getAgent } from 'npm:@knowlearning/agents/deno.js'

        const report = await Agent.state('queue-report')
        try {
          const ReceiverAgent = getAgent('${receiver}')
          await ReceiverAgent.state('queue-input')
          const send = sequence => ReceiverAgent.interact('queue-input', [
            { op: 'add', path: ['active', 'sequence'], value: sequence }
          ])
          const responses = []
          for (let sequence = 0; sequence < ${burstSize}; sequence += 1) {
            responses.push(send(sequence))
            await Promise.resolve()
          }
          const burst = await Promise.all(responses)
          const following = await send(${burstSize})
          report.indices = [...burst, following].map(response => response.ii)
          report.done = true
        }
        catch (error) { report.error = String(error) }
      `))

      const report = await waitForState('queue-report', sender, sender, state => state.done)
      await waitForState('queue-status', receiver, receiver, state => state.completed >= burstSize + 1)
      const localAudit = await Agent.state('queue-audit', receiver, receiver)
      const remoteAudit = await Agent.state('queue-audit', receiver, remote)
      const status = await Agent.state('queue-status', receiver, receiver)
      const sequences = Array.from({ length: burstSize + 1 }, (value, index) => index)
      const expectedEvents = sequences.map(sequence => ({ sequence, ii: report.indices[sequence] }))

      expect(report.indices).to.deep.equal(sequences.map(sequence => report.indices[0] + sequence))
      expect(localAudit.events).to.deep.equal(expectedEvents)
      expect(remoteAudit.events).to.deep.equal(expectedEvents)
      expect(status.completed).to.equal(sequences.length)
      expect(Object.keys(status.responses)).to.have.length(sequences.length)
      for (const destination of ['local', 'remote']) {
        expect(sequences.map(sequence => status.responses[`sequence-${sequence}`][destination]))
          .to.deep.equal(sequences.map(sequence => status.responses['sequence-0'][destination] + sequence))
      }
    }
    finally {
      for (const domain of [sender, receiver, remote]) {
        await configureDomain(domain, configuration(null))
      }
    }
  })
}
