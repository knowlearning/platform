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

const embedLevel = (await Agent.environment()).context.length

mocha.run()
describe(`${embedLevel > 0 ? `Embed Level ${embedLevel}` : 'Root'} Core API`, function () {
  metadata()
  mutate()
  arrays()
  watch()
  if (!Agent.embedded) watchDeep()
  vuex()
  if (!Agent.embedded) reconnect()
  if (!Agent.embedded) postgres()
  uploads()
  latestBugfixes()
  multiAgent()
})

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