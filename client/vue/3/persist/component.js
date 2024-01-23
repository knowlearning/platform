import { watchEffect, defineAsyncComponent } from 'vue'
import browserAgent from '../../../agents/browser/initialize.js'

//  TODO: probably want to make this a util, and better fleshed out (with white instead of blacklist)
function isScopeSerializable(v) {
  return !(
    v instanceof HTMLElement
  )
}

export default function (module, scope) {
  const Agent = browserAgent()
  return defineAsyncComponent(async function () {
    const component = module.default ? { ...module.default } : { ...module } //  copy component since we will mess with mounted and data functions

    if (!component.ephemeral) {
      const state = await Agent.state(scope)

      if (component.data) {
        const origDataFn = component.data
        component.data = function dataProxy() {
          if (Object.keys(state).length === 0) {
            const startState = origDataFn.apply(this, arguments)
            Object.assign(state, startState)
          }
          return state
        }
      }
      else if (component.setup) {
        throw new Error('vuePersistantCompoent is for components using the Options API. To use the composition API see https://docs.knowlearning.systems/frameworks/vue/')
      }
    }

    return component
  })
}
