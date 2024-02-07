
export default function () {
  describe('Domain Agent Side Effects', function () {
    const ID_1 = uuid()
    const SIDE_EFFECT_TYPE = 'application/json;type=side-effect-test'
    it('Can write into a side effect scope', async function () {
      const metadata = await Agent.metadata(ID_1)
      const state = await Agent.state(ID_1)
      metadata.active_type = SIDE_EFFECT_TYPE
      state.an_update = true

      //  TODO: get result of side effect....
    })
  })
}