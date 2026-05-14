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
import newDomainAgents from './tests/new-domain-agents.js'
import vuex from './tests/vuex.js'
import stateTest from './tests/state.js'
import environmentTest from './tests/environment.js'
import namespacedEmbeddings from './tests/namespaced-embeddings.js'
import latestBugfixes from './tests/latest-bugfixes.js'
import syncedState from './tests/synced-state.js'
import crossServer from './tests/cross-server.js'
import Agent from '@knowlearning/agents/browser.js'
import browserAgent from '@knowlearning/agents/browser/initialize.js'
import { vuePersistentStore } from '@knowlearning/agents/vue.js'

import 'mocha/mocha.css'

window.Agent = Agent
// if (!Agent.embedded) Agent.local()

const id = window.location.pathname.slice(1)
const { mode='test' } = await Agent.environment()

if (id.startsWith('reconnect_test')) {
  const name = id.split('/')[1]
  const x = await Agent.state(name)
  x.a = uuid()
//  await Agent.synced()
  const other = await Agent.state(name)
  if (other.a !== x.a) {
    console.log('ERROR!!!!!!!!!!!!', x.a, other.a)
  }
  else location.reload()
}
if (id.split('/')[0] === 'embed_close_sync_test') {
  const stateId = id.split('/')[1]
  const x = await Agent.state(stateId)
  for (let i=0; i<100; i++) {
    await new Promise( r => setTimeout(r) )
    x.a = i
  }
  await new Promise( r => setTimeout(r) )
  x.a = 'expected'
  await Agent.synced()
  Agent.close(stateId)
}
else if (mode === 'EMBEDED_WATCHER_TEST_MODE') {
  const states = []
  const unwatch = Agent.watch(id, ({ patch, state }) => {
    states.push(state)
    if (state.done && patch) {
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
else if (mode === 'EMBEDED_CROSS_DOMAIN_QUERY_TEST_MODE') {
  const { domain } = await Agent.environment()
  const foreignQueryDomain = `foreign-query-config.${domain}`
  const result = await Agent.query('wildcard-requesting-domain-values', [], foreignQueryDomain)
  Agent.close(result)
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
else if (mode === 'EMBEDED_SCOPE_NAMESPACE_ALLOW_TEST_MODE') {
  const scope ='some-namespaced-scope-name'
  const unnamespacedScope = 'this-avoids-namespacing/' + scope
  Agent.watch(unnamespacedScope, async ({ state: unnamespacedState }) => {

    if (unnamespacedState.modifiedInEmbed) {
      Agent.watch(scope, async ({ state: namespacedState }) => {
      //  TODO: FIX: the namespace is "[object, Object]" since we're allowing a richer namespace object with an allow list
        if (namespacedState.modified && namespacedState.modifiedInEmbed) Agent.close(JSON.parse(JSON.stringify({
          unnamespacedState,
          namespacedState
        })))
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
else if (mode === 'SYNCED_PARENT_TO_EMBED') {
  // Embedded agent subscribes with .synced(); parent sends updates; embedded closes with received value
  const scopeId = id.split('/')[1]
  await Agent.state(scopeId).synced(updated => {
    if (updated.done) Agent.close(updated.x)
  })
}
else if (mode === 'SYNCED_PARENT_TO_EMBED_PATCH') {
  const scopeId = id.split('/')[1]
  await Agent.state(scopeId).synced((updated, patch) => {
    if (updated.done) Agent.close({ x: updated.x, patch })
  })
}
else if (mode === 'SYNCED_EMBED_TO_PARENT') {
  // Embedded agent modifies scope; parent's .synced() proxy reflects the change
  const scopeId = id.split('/')[1]
  const state = await Agent.state(scopeId)
  state.x = 42
  await Agent.synced()
  Agent.close(null)
}
else if (mode === 'SYNCED_EMBED_BATCHED_LOCAL') {
  const scopeId = id.split('/')[1]
  const snapshots = []
  const state = await Agent.state(scopeId).synced(s => snapshots.push(JSON.parse(JSON.stringify(s))))

  state.a = 1
  state.b = 2
  state.c = 3
  await Agent.synced()

  Agent.close({
    callbackCount: snapshots.length,
    snapshot: snapshots[0],
    proxy: JSON.parse(JSON.stringify(state))
  })
}
else if (mode === 'SYNCED_EMBED_ASYNC_LOCAL') {
  const scopeId = id.split('/')[1]
  const snapshots = []
  const state = await Agent.state(scopeId).synced(s => snapshots.push(s.x))

  state.x = 'one'
  await Agent.synced()
  await new Promise(r => setTimeout(r, 200))

  state.x = 'two'
  await Agent.synced()
  await new Promise(r => setTimeout(r, 200))

  Agent.close({ snapshots, proxy: state.x })
}
else if (mode === 'SYNCED_EMBED_ARRAY_LOCAL') {
  const scopeId = id.split('/')[1]
  let callbackArg
  const state = await Agent.state(scopeId).synced(s => {
    callbackArg = s.items ? s.items.slice() : s.items
  })

  state.items = []
  await Agent.synced()
  await new Promise(r => setTimeout(r, 100))

  state.items.push('a')
  await Agent.synced()
  await new Promise(r => setTimeout(r, 200))

  Agent.close({
    proxy: state.items.slice(),
    callbackArg
  })
}
else {
  const runCrossServer = new URLSearchParams(location.search).get('crossServer') === '1'

  //  set up some globals for ease of use in test files
  window.expect = chai.expect
  window.uuid = uuid
  window.pause = ms => new Promise(r => setTimeout(r, ms))
  if (!runCrossServer) {
    window.Agent2 = browserAgent({ unique: true, getToken: () => 'anonymous', root: true})
    window.Agent3 = browserAgent({ unique: true, getToken: () => 'anonymous', root: true})
  }

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

  let afterMochaRun = () => {}

  if (runCrossServer) {
    crossServer(browserAgent)
  }
  else {
    describe(`${mode.length > 4 ? `Embed Level ${mode.length - 4}` : 'Root'} Core API`, function () {
      latestBugfixes()
      if (mode.length === 4) postgres()
      //if (mode.length === 4) domainAgents()
      //if (mode.length === 4) newDomainAgents()
      stateTest()
      environmentTest()
      metadata()
      mutate()
      arrays()
      watch()
      watchDeep()
      vuex(vuePersistentStore)
      namespacedEmbeddings()
      if (mode.length === 4) reconnect()
      uploads()
      multiAgent()
      syncedState()
    })

    afterMochaRun = () => {
      if (mode === 'test') {
        document.getElementById('mocha').style.width = '33%'
        document.getElementById('embedded-wrapper').style.width = '67%'
      }

      if (mode.length < 6 && location.search === '') {
        const wrapper = document.getElementById('embedded-wrapper')
        wrapper.style.display = 'block'
        const iframe = document.getElementById('embedded-frame')
        Agent.embed({ id: `${location.protocol}//${location.host}/${mode}+`, mode: `${mode}+` }, iframe)
      }
    }
  }

  window.__mochaDone = false
  window.__mochaFailures = []
  const runner = mocha.run()
  runner.on('fail', (test, error) => {
    window.__mochaFailures.push({
      title: test.title,
      fullTitle: test.fullTitle(),
      message: error?.message,
      stack: error?.stack
    })
  })
  runner.on('end', () => {
    window.__mochaStats = runner.stats
    window.__mochaDone = true
  })
  afterMochaRun()
}
