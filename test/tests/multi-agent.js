import { browserAgent } from '@knowlearning/agents'

export default function () {
  const checkAgent = browserAgent()
  describe('Multi Agent Interactions', function () {
    // TODO: test clearing a runstate

    it('Allows multiple different agents to connect', async function () {
      const { auth: { user: user1 }, domain: domain1 } = await Agent.environment()
      const { auth: { user: user2 }, domain: domain2 } = await Agent2.environment()
      expect(user1).to.not.equal(user2)
    })
  })
}
