import { v1 as uuid } from 'uuid'
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
import vuex from './tests/vuex.js'
import latestBugfixes from './tests/latest-bugfixes.js'
import { browserAgent } from '@knowlearning/agents'

import 'mocha/mocha.css'

window.Agent = browserAgent()
window.Agent2 = browserAgent({ unique: true, getToken: () => 'anonymous', root: true})

if (!Agent.embedded) Agent.local()

//  set up some globals for ease of use in test files
window.expect = chai.expect
window.uuid = uuid

chai.config.truncateThreshold = 0; // disable truncating

mocha
  .setup({
    ui: 'bdd',
    reporter: 'HTML',
    rootHooks: {
      beforeEach(done) {
        done()
      }
    }
  })

const container = document.createElement('div')
container.id = 'mocha'
document.body.appendChild(container)

mocha.run()
describe('Core API', function () {
  metadata()
  mutate()
  arrays()
  watch()
  if (!Agent.embedded) watchDeep()
  vuex()
  reconnect()
  if (!Agent.embedded) postgres()
  uploads()
  latestBugfixes()
  multiAgent()
})
