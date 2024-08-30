import * as messageQueue from './message-queue.js'
import resolveReference from './resolve-reference.js'

const outstandingPromises = new Set()

export async function synced() {
  //  TODO: make sure all expected things are added to outstanding promises
  await Promise.all([...outstandingPromises, ...messageQueue.pending])
}

export function watch(scope, callback, user, domain) {
  let resolveWatchSynced
  outstandingPromises.add(new Promise(r => resolveWatchSynced = r))

  if (Array.isArray(scope)) {
    resolveWatchSynced()
    return watchResolution(scope, callback, user, domain)
  }

  let closed = false
  let closeMessageQueue
  ;(async () => {
    const { id, user: owner, domain: d, scope: s } = await resolveReference(domain, user, scope)
    user = owner
    domain = d
    scope = s
    if (closed) {
      resolveWatchSynced()
      return
    }

    const { messages, historyLength, created } = await messageQueue.process(id)

    if (closed) {
      resolveWatchSynced()
      messages.close()
      return
    }

    if (historyLength === 0) {
      callback({
        ii: 0,
        history: [],
        metadataHistory: [],
        state: {},
        metadata:  { domain, owner: user, name: scope}, //  TODO: more...
        patch: null
      })
    }

    closeMessageQueue = () => messages.close()
    const history = []
    const metadataHistory = []
    let state = {}
    let metadata = {}

    function addPatchToHistory(patch) {
      const statePatch = patch.filter(op => !op.metadata)
      const metadataPatch = patch.filter(op => op.metadata)
      if (statePatch.length) history.push(statePatch)
      if (metadataPatch.length) metadataHistory.push(metadataPatch)
    }

    //  TODO: account for history if old messages were cleared
    for await (const message of messages) {
      if (closed) return resolveWatchSynced()

      const patch = JSONCodec().decode(message.data)
      if (message.seq < historyLength) {
        addPatchToHistory(patch)
      }
      else if (message.seq === historyLength) {
        addPatchToHistory(patch)
        state = stateFromHistory(history)
        metadata = stateFromHistory(metadataHistory)
        metadata.created = created
        metadata.updated = Math.floor(message.info.timestampNanos / 1_000_000)
        history.slice(0, history.length) // TODO: decide what to do with history caching
        metadataHistory.slice(0, metadataHistory.length) // TODO: decide what to do with history caching
        callback({
          ii: message.seq - 1,
          history,
          metadataHistory,
          state: structuredClone(state),
          metadata: structuredClone(metadata),
          patch: null
        })
        resolveWatchSynced()
      }
      else {
        const statePatch = patch.filter(op => !op.metadata)
        const metadataPatch = patch.filter(op => op.metadata)
        state = applyStandardPatch(state, statePatch)
        metadata = applyStandardPatch(metadata, metadataPatch)
        metadata.updated = message.seq
        callback({
          patch,
          ii: message.seq - 1,
          state: structuredClone(state),
          metadata: structuredClone(metadata)
        })
      }
      message.ack()
    }
  })()

  return function unwatch() {
    closed = true
    resolveWatchSynced()
    if (closeMessageQueue) closeMessageQueue()
  }
}

export async function state(scope, user, domain) {

  let resolveStartState
  const startState = new Promise(r => resolveStartState = r)

  const { id } = await resolveReference(domain, user, scope)

  watch(
    scope,
    ({ state }) => resolveStartState(state),
    user,
    domain
  )

  return new PatchProxy(
    await startState,
    patch => messageQueue.publish(id, patch)
  )

}

export async function interact(scope, patch) {
  const message = JSONCodec().encode(patch)
  const { auth: { user }, domain } = await environment()
  const { id } = await resolveReference(domain, user, scope)
  return messageQueue.publish(id, message, false, false)
}

function stateFromHistory(history) {
  return history.reduce(applyStandardPatch, {})
}

function applyStandardPatch(state, patch) {
  const lastResetPatchIndex = patch.findLastIndex(p => p.path.length === 0)
  if (lastResetPatchIndex > -1) state = structuredClone(patch[lastResetPatchIndex].value)
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
      ) {
        callback(value)
        //  TODO: consider if we should log a warning if value is null
        //        or undefined and there more references to traverse
        return
      }
      else if (isUUID(value)) {
        const deeperReferences = [value, ...references.slice(index + 1)]
        unwatchDeeper = watchResolution(deeperReferences, callback, user, domain)
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

export async function reset(scope, user, domain) {
  const { id } = await resolveReference(domain, user, scope)
  await messageQueue.publish(id, [{ op: 'replace', path: [], value: {} }])
}

export async function metadata(scope, user, domain) {
  const { id } = await resolveReference(domain, user, scope)
  return new Promise(resolve => {
    const unwatch = watch(id, ({ metadata }) => {
      unwatch()
      //  TODO: deprecate active_type...
      metadata.active_type = metadata.type
      delete metadata.type
      resolve(
        new PatchProxy(metadata, patch => {
          if (!patch.every(isValidMetadataMutation)) {
            throw new Error("You may only modify the type or name for a scope's metadata")
          }
          patch.forEach(op => {
            op.metadata = true
            op.path = ['type'] //  TODO: deprecate active_type and migrate to type being immutable and part of immutable name
          })
          messageQueue.publish(id, patch)
        })
      )
    })
  })
}

function isValidMetadataMutation({ path, op, value }) {
  return (
    path[0] === 'active_type'
    && path.length === 1
    && typeof value === 'string' || op === 'remove'
  )
}
