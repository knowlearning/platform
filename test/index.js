import { v1 as uuid, validate as isUUID } from 'uuid'
import chai from 'chai/chai.js'
import 'mocha/mocha.js'
import mutate from './tests/mutate.js'
import watch from './tests/watch.js'
import watchDeep from './tests/watch-deep.js'
import multiAgent from './tests/multi-agent.js'
import reconnect from './tests/reconnect.js'
import arrays from './tests/arrays.js'
import metadata from './tests/metadata.js'
import uploads from './tests/uploads.js'
import postgres from './tests/postgres.js'
import domainAgents from './tests/domain-agents.js'
import vuex from './tests/vuex.js'
import stateTest from './tests/state.js'
import environmentTest from './tests/environment.js'
import namespacedEmbeddings from './tests/namespaced-embeddings.js'
import latestBugfixes from './tests/latest-bugfixes.js'
import Agent from '@knowlearning/agents/browser.js'
import browserAgent from '@knowlearning/agents/browser/initialize.js'

import 'mocha/mocha.css'

window.Agent = Agent
// if (!Agent.embedded) Agent.local()

const id = window.location.pathname.slice(1)
const { mode } = await Agent.environment()

if (mode === 'EMBEDED_WATCHER_TEST_MODE') {
  const states = []
  const unwatch = Agent.watch(id, ({ patch, state }) => {
    states.push(state)
    if (state.done) {
      Agent.close(JSON.parse(JSON.stringify(states)))
      unwatch()
    }
  })
}
else if (mode === 'EMBEDED_QUERY_TEST_MODE') {
  const result = await Agent.query('my-test-table-entries')
  Agent.close(result)
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
  Agent.watch(scope, async ({ state }) => {
    if (state.modified && state.modifiedInEmbed) Agent.close(JSON.parse(JSON.stringify(state)))
  })
  const s = await Agent.state(scope)
  s.modifiedInEmbed = true
}
else if (mode === 'EMBEDDED_ENVIRONMENT_TEST_MODE') {
  const id = uuid()
  Agent.close(await Agent.environment(id))
}
else {
  //  set up some globals for ease of use in test files
  window.expect = chai.expect
  window.uuid = uuid
  window.pause = ms => new Promise(r => setTimeout(r, ms))
  window.Agent2 = browserAgent({ unique: true, getToken: () => 'anonymous', root: true})
  window.Agent3 = browserAgent({ unique: true, getToken: () => 'anonymous', root: true})

  chai.config.truncateThreshold = 0; // disable truncating

  mocha
    .setup({
      ui: 'bdd',
      reporter: 'HTML',
      slow: 1000,
      rootHooks: {
        beforeEach(done) {
          done()
        }
      }
    })

  const embedLevel = (await Agent.environment()).context.length

  if (embedLevel < 3) {
    mocha.run()
    describe(`${embedLevel > 0 ? `Embed Level ${embedLevel}` : 'Root'} Core API`, function () {
      // if (!Agent.embedded) postgres()
      if (!Agent.embedded) domainAgents()
      // stateTest()
      // environmentTest()
      // metadata()
      // mutate()
      // arrays()
      // watch()
      // watchDeep()
      // vuex()
      // namespacedEmbeddings()
      // if (!Agent.embedded) reconnect()
      // uploads()
      // latestBugfixes()
      // multiAgent()
    })
  }

  if (embedLevel === 0) {
    document.getElementById('mocha').style.width = '33%'
    document.getElementById('embedded-wrapper').style.width = '67%'
  }

  if (embedLevel < 2) {
    const wrapper = document.getElementById('embedded-wrapper')
    wrapper.style.display = 'block'
    const iframe = document.getElementById('embedded-frame')
    const id = uuid()
    await Agent.create({
      id,
      active_type: 'application/json',
      active: { x: 101, y: 'dalmations' }
    })
    Agent.embed({ id }, iframe)
  }
}
