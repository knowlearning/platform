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

window.Agent = Agent
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
  //postgresTest()
})

mocha.run()
