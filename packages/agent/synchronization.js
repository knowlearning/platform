import PatchProxy, { standardJSONPatch } from '@knowlearning/patch-proxy'
import { applyPatch } from 'fast-json-patch'
import * as messageQueue from './message-queue.js'

const { host } = window.location
const userPromise = new Promise(r => r('me'))

export async function synced() {
  //  TODO: actually implement this behavior
  //        main thrust is having state manager
  //        confirm that side effects have been applied
  //        for latest session mutation
  return new Promise(r => r())
}

export async function watch(scope, callback, user=userPromise, domain=host) {
  user = await user

  ;(async () => {
    const { messages, historyLength } = await messageQueue.process(subject(domain, user, scope))
    if (historyLength === 0) callback({ history: [], state: {}, patch: null })

    const history = []
    //  TODO: account for history if old messages were cleared
    for await (const message of messages) {
      const patch = messageQueue.decodeJSON(message.data)
      if (message.seq < historyLength) {
        history.push(patch)
      }
      else if (message.seq === historyLength) {
        history.push(patch)
        const state = stateFromHistory(history)
        history.slice(0, history.length) // TODO: decide what to do with history caching
        callback({ history, state, patch: null })
      }
      else {
        callback({ patch })
      }
      message.ack()
    }
  })()

  //  TODO: return unsubscribe function
}

export async function state(scope, user=userPromise, domain=host) {
  user = await user

  let resolveStartState
  const startState = new Promise(r => resolveStartState = r)

  watch(
    scope,
    ({ state }) => resolveStartState(state),
    user,
    domain
  )

  //  TODO: only return patch proxy if user is owner, otherwise
  //        send proxy that just errors on mutation
  return new PatchProxy(
    await startState,
    patch => messageQueue.publish(subject(domain, user, scope), patch)
  )
}

function subject(domain, user, scope) {
  return `${domain}_${user}_${scope}`
}

function stateFromHistory(history) {
  return history.reduce((state, patch) => {
    const lastResetPatchIndex = patch.findLastIndex(p => p.path.length === 0)
    if (lastResetPatchIndex > -1) state = patch[lastResetPatchIndex].value

    const JSONPatch = standardJSONPatch(patch.slice(lastResetPatchIndex + 1))
    return applyPatch(state, JSONPatch).newDocument
  }, {})
}