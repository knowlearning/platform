import { v1 as uuid } from 'uuid'

const copy = value => JSON.parse(JSON.stringify(value))
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

export default async function runEmbeddedMode({
  Agent,
  id,
  mode,
  createUUID=uuid,
  wait=pause
}) {
  if (id.split('/')[0] === 'embed_close_sync_test') {
    const stateId = id.split('/')[1]
    const state = await Agent.state(stateId)
    for (let i = 0; i < 100; i += 1) {
      await wait()
      state.a = i
    }
    await wait()
    state.a = 'expected'
    await Agent.synced()
    Agent.close(stateId)
    return true
  }

  if (mode === 'EMBEDED_WATCHER_TEST_MODE') {
    const states = []
    const unwatch = Agent.watch(id, ({ patch, state }) => {
      states.push(state)
      if (state.done && patch) {
        Agent.close(copy(states))
        unwatch()
      }
    })
    return true
  }

  if (mode === 'EMBEDED_QUERY_TEST_MODE') {
    Agent.close(await Agent.query('my-test-table-entries'))
    return true
  }

  if (mode === 'EMBEDED_QUERY_ERROR_TEST_MODE') {
    try {
      const response = await Agent.query('no-query-named-this')
      Agent.close(`NO ERROR THROWN... response was ${response}`)
    }
    catch (error) {
      Agent.close(null)
    }
    return true
  }

  if (mode === 'EMBEDED_CROSS_DOMAIN_QUERY_TEST_MODE') {
    const { domain } = await Agent.environment()
    const foreignQueryDomain = `foreign-query-config.${domain}`
    Agent.close(await Agent.query('wildcard-requesting-domain-values', [], foreignQueryDomain))
    return true
  }

  if (mode === 'EMBEDED_PARALLEL_QUERY_TEST_MODE') {
    const numParallelQueries = 1000
    const queries = []
    for (let i = 0; i < numParallelQueries; i += 1) {
      queries.push(Agent.query('my-test-table-entries'))
    }
    await Promise.all(queries)
    Agent.close(null)
    return true
  }

  if (mode === 'EMBEDED_SCOPE_NAMESPACE_TEST_MODE') {
    const scope = 'some-namespaced-scope-name'
    Agent.watch(scope, async ({ state }) => {
      if (state.modified && state.modifiedInEmbed) Agent.close(copy(state))
    })
    const state = await Agent.state(scope)
    state.modifiedInEmbed = true
    return true
  }

  if (mode === 'EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE') {
    const scope = 'some-namespaced-scope-name'
    const unnamespacedScope = `this-avoids-namespacing/${scope}`
    Agent.watch(unnamespacedScope, async ({ state: unnamespacedState }) => {
      if (unnamespacedState.modifiedInEmbed) {
        Agent.watch(scope, async ({ state: namespacedState }) => {
          if (namespacedState.modified && namespacedState.modifiedInEmbed) {
            Agent.close(copy({ unnamespacedState, namespacedState }))
          }
        })
        const state = await Agent.state(scope)
        state.modifiedInEmbed = true
      }
    })
    const state = await Agent.state(unnamespacedScope)
    state.modifiedInEmbed = true
    return true
  }

  if (mode === 'EMBEDDED_ENVIRONMENT_TEST_MODE') {
    Agent.close(await Agent.environment(createUUID()))
    return true
  }

  if (mode === 'SYNCED_PARENT_TO_EMBED') {
    const scopeId = id.split('/')[1]
    await Agent.state(scopeId).synced(updated => {
      if (updated.done) Agent.close(updated.x)
    })
    return true
  }

  if (mode === 'SYNCED_PARENT_TO_EMBED_PATCH') {
    const scopeId = id.split('/')[1]
    await Agent.state(scopeId).synced((updated, patch) => {
      if (updated.done) Agent.close({ x: updated.x, patch })
    })
    return true
  }

  if (mode === 'SYNCED_EMBED_TO_PARENT') {
    const scopeId = id.split('/')[1]
    const state = await Agent.state(scopeId)
    state.x = 42
    await Agent.synced()
    Agent.close(null)
    return true
  }

  if (mode === 'SYNCED_EMBED_BATCHED_LOCAL') {
    const scopeId = id.split('/')[1]
    const snapshots = []
    const state = await Agent.state(scopeId).synced(snapshot => snapshots.push(copy(snapshot)))

    state.a = 1
    state.b = 2
    state.c = 3
    await Agent.synced()

    Agent.close({
      callbackCount: snapshots.length,
      snapshot: snapshots[0],
      proxy: copy(state)
    })
    return true
  }

  if (mode === 'SYNCED_EMBED_ASYNC_LOCAL') {
    const scopeId = id.split('/')[1]
    const snapshots = []
    const state = await Agent.state(scopeId).synced(snapshot => snapshots.push(snapshot.x))

    state.x = 'one'
    await Agent.synced()
    await wait(200)

    state.x = 'two'
    await Agent.synced()
    await wait(200)

    Agent.close({ snapshots, proxy: state.x })
    return true
  }

  if (mode === 'SYNCED_EMBED_ARRAY_LOCAL') {
    const scopeId = id.split('/')[1]
    let callbackArg
    const state = await Agent.state(scopeId).synced(snapshot => {
      callbackArg = snapshot.items ? snapshot.items.slice() : snapshot.items
    })

    state.items = []
    await Agent.synced()
    await wait(100)

    state.items.push('a')
    await Agent.synced()
    await wait(200)

    Agent.close({
      proxy: state.items.slice(),
      callbackArg
    })
    return true
  }

  return false
}
