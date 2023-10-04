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
import vuex from './tests/vuex.js'
import latestBugfixes from './tests/latest-bugfixes.js'
import { browserAgent } from '@knowlearning/agents'

import 'mocha/mocha.css'

window.Agent = browserAgent()

if (!Agent.embedded && confirm('Test locally?')) Agent.local()
else Agent.remote()

if (window.location.hostname === 'localhost' || window.location.hostname.endsWith('.localhost')) {
  const { auth: { user, provider } } = await Agent.environment()
  if (provider === 'anonymous') Agent.login()
  else if (!window.location.hostname.startsWith(user + '.')) {
    window.location.href = `https://${user}.localhost:5173`
  }
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
      vuex()
      reconnect()
      if (!Agent.embedded) postgres()
      uploads()
      latestBugfixes()
    })
  })
