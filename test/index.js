import { v1 as uuid } from 'uuid'
import chai from 'chai/chai.js'
import 'mocha/mocha.js'
import mutate from './tests/mutate.js'
import watch from './tests/watch.js'
import reconnect from './tests/reconnect.js'
import arrays from './tests/arrays.js'
import metadata from './tests/metadata.js'
import uploads from './tests/uploads.js'
import postgres from './tests/postgres.js'
import latestBugfixes from './tests/latest-bugfixes.js'
import { browserAgent } from '@knowlearning/agents'

import 'mocha/mocha.css'

window.Agent = browserAgent()

if (window.location.hostname === 'localhost') {
  const { auth: { user } } = await Agent.environment()
  window.location.href = `https://${user}.${window.location.host}`
}

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

Agent
  .environment()
  .then(() => {
    mocha.run()
    describe('Core API', function () {
      metadata()
      mutate()
      arrays()
      watch()
      reconnect()
      uploads()
      if (!Agent.embedded) postgres()
      latestBugfixes()
    })
  })
