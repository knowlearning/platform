import PatchProxy, { standardJSONPatch } from '@knowlearning/patch-proxy'
import { applyPatch } from 'fast-json-patch'
import * as messageQueue from './message-queue.js'
import environment from './environment.js'
import resolveReference from './resolve-reference.js'

const { host } = window.location
const userPromise = environment().then(({ auth: { user } }) => user)

const outstandingPromises = new Set()

export async function synced() {
  //  TODO: make sure all expected things are added to outstanding promises
  await Promise.all(outstandingPromises)
}

export async function watch(scope, callback, user=userPromise, domain=host) {
  let resolveWatchSynced
  outstandingPromises.add(new Promise(r => resolveWatchSynced = r))

  if (Array.isArray(scope)) {
    resolveWatchSynced()
    return watchResolution(scope, callback, user, domain)
  }
  user = await user

  ;(async () => {
    const subject = await resolveReference(domain, user, scope)
    const { messages, historyLength } = await messageQueue.process(subject)
    const history = []
    let state = {}

    if (historyLength === 0) {
      callback({ ii: 0, history, state: {}, patch: null})
      resolveWatchSynced()
    }

    //  TODO: account for history if old messages were cleared
    for await (const message of messages) {
      const patch = messageQueue.decodeJSON(message.data)
      const ii = message.seq
      if (ii < historyLength) {
        history.push(patch)
      }
      else if (ii === historyLength) {
        history.push(patch)
        state = stateFromHistory(history)
        history.slice(0, history.length) // TODO: decide what to do with history caching
        callback({ ii, history, state: structuredClone(state), patch: null })
        resolveWatchSynced()
      }
      else {
        state = applyStandardPatch(state, patch)
        callback({ patch, ii, state: structuredClone(state) })
      }
      message.ack()
    }
  })()

  return function unsubscribe() {
    //  TODO: implement
  }
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

  const subject = await resolveReference(domain, user, scope)

  //  TODO: only return patch proxy if user is owner, otherwise
  //        send proxy that just errors on mutation
  return new PatchProxy(
    await startState,
    patch => messageQueue.publish(subject, patch)
  )
}

function stateFromHistory(history) {
  return history.reduce(applyStandardPatch, {})
}

function applyStandardPatch(state, patch) {
  const lastResetPatchIndex = patch.findLastIndex(p => p.path.length === 0)
  if (lastResetPatchIndex > -1) state = patch[lastResetPatchIndex].value

  const JSONPatch = standardJSONPatch(patch.slice(lastResetPatchIndex + 1))
  return applyPatch(state, JSONPatch).newDocument
}


function watchResolution(path, callback, user, domain) {
  const id = path[0]
  const references = path.slice(1)
  let unwatchDeeper = () => {}

  const watchCallback = ({ state }) => {
    if (references.length === 0) {
      callback(state)
      return
    }

    //  TODO: check if value we care about actually changed
    //        and ignore this update if it has not.
    unwatchDeeper()

    let value = state
    for (let index = 0; index < references.length; index += 1) {
      value = value[references[index]]
      if (
        value === null ||
        value === undefined ||
        index === references.length - 1
      ) callback(value)
      else if (isUUID(value)) {
        unwatchDeeper = watchResolution([value, ...references.slice(index + 1)], callback, user, domain)
        return
      }
    }
  }

  const unwatch = watch(id, watchCallback, user, domain)

  return () => {
    unwatch()
    unwatchDeeper()
  }
}