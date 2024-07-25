export default function () {
  describe('Get and set metadata', function () {
    it('Can get metadata', async function () {
      const id = uuid()

      const { auth: { user }, domain } = await Agent.environment()

      const metadata = await Agent.metadata(id)
      console.log(metadata)
      expect(metadata.owner).to.equal(user)
      expect(metadata.domain).to.equal(domain)
      expect(metadata.active).to.equal(undefined)
      expect(metadata.created).to.be.a('number')
      expect(Date.now() - metadata.created).to.be.lessThan(1000)
      expect(metadata.created).to.equal(metadata.updated)
      expect(metadata.active_type).to.equal('application/json')
    })

    it('Can set metadata', async function () {
      const id = uuid()

      const DEMO_TYPE = 'application/json;type=some-demo-type'
      const md1 = await Agent.metadata(id)

      md1.active_type = DEMO_TYPE
      md1.name = 'Demo name'

      const md2 = await Agent.metadata(id)
      expect(md2.active_type).to.equal(DEMO_TYPE)
      expect(md2.name).to.equal(md1.name)
    })

    it('Cannot set metadata other than name and type', async function () {
      const id = uuid()

      let errored = false
      try {
        const metadata = await Agent.metadata(id)
        metadata.user = 'hacker'
      }
      catch (error) { errored = true }

      if (!errored) throw new Error('Setting user should not be possible')
    })
  })
}
