import Agent from '@knowlearning/agent'
import { v1 as uuid } from 'uuid'
import chai from 'chai/chai.js'
import 'mocha/mocha.js'
import 'mocha/mocha.css'
import vuePersistentStore from '@knowlearning/agent/vuex.js'

import stateTest from '../test/tests/state.js'
import mutateTest from '../test/tests/mutate.js'
import arrayTest from '../test/tests/arrays.js'
import metadataTest from '../test/tests/metadata.js'
import watchTest from '../test/tests/watch.js'
import watchDeepTest from '../test/tests/watch-deep.js'
import vuexTest from '../test/tests/vuex.js'
import uploadTest from '../test/tests/uploads.js'
import latestBugfixesTest from './tests/latest-bugfixes.js'
import postgresTest from '../test/tests/postgres.js'
import namespacedEmbeddingsTest from '../test/tests/namespaced-embeddings.js'
import environmentTest from '../test/tests/environment.js'
import multiAgentTest from '../test/tests/multi-agent.js'

window.Agent = Agent

const id = window.location.pathname.slice(1)
const { mode } = await Agent.environment()

if (mode === 'EMBEDED_QUERY_TEST_MODE') {
  const result = await Agent.query('my-test-table-entries')
  Agent.close(result)
}
else if (mode === 'EMBEDED_WATCHER_TEST_MODE') {
  const states = []
  const unwatch = Agent.watch(id, update => {
    const { state } = update
    states.push(state)
    if (state.done) {
      Agent.close(JSON.parse(JSON.stringify(states)))
      unwatch()
    }
  })
}
else if (mode === 'EMBEDED_QUERY_ERROR_TEST_MODE') {
  try {
    const response = await Agent.query('no-query-named-this')
    Agent.close('NO ERROR THROWN... response was ' + response)
  }
  catch (error) {
    Agent.close(null)
  }
}
else if (mode === 'EMBEDED_PARALLEL_QUERY_TEST_MODE') {
  const numParallelQueries = 1000
  const queries = []
  for (let i=0; i<numParallelQueries; i++) {
    queries.push(Agent.query('my-test-table-entries'))
  }
  const results = await Promise.all(queries)
  Agent.close(null)
}
else if (mode === 'EMBEDED_SCOPE_NAMESPACE_TEST_MODE') {
  const scope ='some-namespaced-scope-name'
  let closed = false
  Agent.watch(scope, async ({ state }) => {
    if (state.modified && state.modifiedInEmbed && !closed) {
      closed = true
      Agent.close(JSON.parse(JSON.stringify(state)))
    }
  })
  const s = await Agent.state(scope)
  s.modifiedInEmbed = true
}
else if (mode === 'EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE') {
  const scope ='some-namespaced-scope-name'
  const unnamespacedScope = 'this-avoids-namespacing/' + scope
  let closed = false
  Agent.watch(unnamespacedScope, async ({ state: unnamespacedState }) => {

    if (unnamespacedState.modifiedInEmbed) {
      Agent.watch(scope, async ({ state: namespacedState }) => {
      //  TODO: FIX: the namespace is "[object, Object]" since we're allowing a richer namespace object with an allow list
        if (namespacedState.modified && namespacedState.modifiedInEmbed && !closed) {
          closed = true
          Agent.close(JSON.parse(JSON.stringify({
            unnamespacedState,
            namespacedState
          })))
        }
      })
      const s = await Agent.state(scope)
      s.modifiedInEmbed = true
    }
  })
  const s = await Agent.state(unnamespacedScope)
  s.modifiedInEmbed = true
}
else if (mode === 'EMBEDDED_ENVIRONMENT_TEST_MODE') {
  const id = uuid()
  Agent.close(await Agent.environment(id))
}
else if (!mode) {
  window.expect = chai.expect
  window.uuid = uuid
  window.pause = ms => new Promise(r => setTimeout(r, ms))
  window.Agent2 = Agent //  TODO: use isolated agents
  window.Agent3 = Agent //  TODO: use isolated agents

  chai.config.truncateThreshold = 0; // disable truncating

  mocha
    .setup({
      ui: 'bdd',
      reporter: 'HTML',
      slow: 1000
    })

  describe(`KnowLearning Agent Tests`, function () {
    stateTest()
    mutateTest()
    arrayTest()
    metadataTest()
    watchTest()
    watchDeepTest()
    vuexTest(vuePersistentStore)
    uploadTest()
    latestBugfixesTest()
    if (!Agent.embedded) postgresTest()
    namespacedEmbeddingsTest()
    environmentTest()
    multiAgentTest()
  })

  mocha.run()
}
else {
  console.warn('UNRECOGNIZED MODE', mode)
}