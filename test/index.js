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
import historyPatchFormat from './tests/history-patch-format.js'
import syncedState from './tests/synced-state.js'
import authentication from './tests/authentication.js'
import crossServer from './tests/cross-server.js'
import runEmbeddedMode from './embedded-modes.js'
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
else if (!(await runEmbeddedMode({ Agent, id, mode }))) {
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
      historyPatchFormat()
      if (mode.length === 4) crossServer(browserAgent, { skipIfUnavailable: true })
      if (mode.length === 4) postgres()
      if (mode.length === 4) domainAgents()
      stateTest()
      environmentTest()
      metadata()
      mutate()
      arrays()
      watch()
      if (mode.length === 4) newDomainAgents()
      watchDeep()
      vuex(vuePersistentStore)
      namespacedEmbeddings()
      if (mode.length === 4) reconnect()
      if (mode.length === 4) authentication(browserAgent)
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
