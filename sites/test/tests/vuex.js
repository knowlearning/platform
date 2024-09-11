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

export default function (vuePersistentStore) {
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
        await pause(10)
        await Agent.synced()
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

    it(
      'Persists mutations to the root store',
      async function () {
        const store = createStore(await vuePersistentStore({
          state: () => copy(STORE_START_STATE),
          modules: {
            level1: {
              scope: LEVEL_1_MODULE_SCOPE,
              state: copy(STORE_LEVEL_1_MODULE_START_STATE)
            }
          },
          mutations: {
            update(state) { state.testInt += 1 }
          },
          actions: {
            update({commit}) { commit('update') }
          }
        }, id))
        const rootPart = { ...store.state }
        rootPart.testInt += 1
        store.dispatch('update')
        expect(rootPart).to.deep.equal(store.state)
      }
    )
    it(
      'Persists mutations to modules',
      async function () {
        const store = createStore(await vuePersistentStore({
          state: () => copy(STORE_START_STATE),
          modules: {
            level1: {
              scope: LEVEL_1_MODULE_SCOPE,
              state: copy(STORE_LEVEL_1_MODULE_START_STATE),
              mutations: {
                update(state) { state.testArrModule2.push(32) }
              },
              actions: {
                update({commit}) { commit('update') }
              }
            }
          }
        }, id))
        const modulePart = { ...store.state.level1 }
        modulePart.testArrModule2 = [...modulePart.testArrModule2, 32]
        store.dispatch('update')
        expect(modulePart).to.deep.equal(store.state.level1)
      }
    )
  })
}
