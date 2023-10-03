import { vuePersistentStore } from '@knowlearning/agents/vue.js'
import { createStore } from 'vuex'

const copy = x => JSON.parse(JSON.stringify(x))

const STORE_START_STATE = {
  testInt: 1,
  testStr: 'str',
  testArr: [1, 2, 3]
}

const STORE_LEVEL_1_MODULE_START_STATE = {
  testArrModule2: [1, 2, 3, 4, 5]
}

export default function () {
  describe('Vuex Store', function () {
    const id = uuid()
    const LEVEL_1_MODULE_SCOPE = uuid()

    it(
      'Initializes a store with the expected default state',
      async function () { 
        const store = createStore(await vuePersistentStore({
          state: () => copy(STORE_START_STATE),
          modules: {
            level1: {
              scope: LEVEL_1_MODULE_SCOPE,
              state: copy(STORE_LEVEL_1_MODULE_START_STATE)
            }
          }
        }, id))
        const rootPart = { ...store.state }
        delete rootPart.level1
        expect(rootPart).to.deep.equal(STORE_START_STATE)
      }
    )

    it(
      'Persists the expected root store data',
      async function () {
        const saved = await Agent.state(id)
        expect(saved).to.deep.equal(STORE_START_STATE)
      }
    )

    it(
      'Persists the expected embedded module scope',
      async function () {
        const saved = await Agent.state(LEVEL_1_MODULE_SCOPE)
        expect(saved).to.deep.equal(STORE_LEVEL_1_MODULE_START_STATE)
      }
    )
  })
}
