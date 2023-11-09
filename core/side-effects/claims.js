import { promises as dnsPromises } from 'dns'
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import interact from '../interact/index.js'
import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'
import MutableProxy from '../../client/persistence/json.js'

const CHALLENGE_TIMEOUT_LIMIT = 1000 * 60 * 5

const { MODE, ADMIN_DOMAIN } = process.env

//  TODO: remove need for core to have initialization state and rely on
//        side effects for individual application/json;type=claim scopes
redis.connected.then(() => {
  const state = initializationState('core', 'core')
  redis.client.json.set('domain-config', '$', state, { NX: true })
})

//  TODO: probably want to abstract this and allow different types
//        to help with removing privaleged named states
function coreState(id, domain) {
  const user = 'core'
  interact(domain, user, id, [{ op: 'add', value: 'application/json', path: ['active_type'] }])
  return new MutableProxy({}, async patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    interact(domain, user, id, patch)
  })
}

export default function claims({ domain, user, session, scope, patch, si, ii, send }) {
  if (domain === ADMIN_DOMAIN || MODE === 'local') { //  can claim from any domain on local
    for (let index = 0; index < patch.length; index ++) {
      const { path, value } = patch[index]
      console.log('CHECKING CLAIM PATCH', domain, user, patch[index])
      if (path.length === 1 && path[0] === 'active') {
        const token = crypto.randomBytes(64).toString('hex')
        const claimedDomain = value.domain //  TODO: graceful fail

        //  Make sure the domain config is initialized
        redis.client.json.set('domain-config', `$["active"][${JSON.stringify(claimedDomain)}]`, {}, { NX: true })

        const report = uuid()
        send({ si, ii, token, report })

        const reportState = coreState(report, domain)

        return (
          passDNSOrHTTPChallenge(claimedDomain, user, token, reportState)
            .then(async passed => {
              console.log('DNS_OR_HTTP_CHALLENGE PASSED?', claimedDomain, user, passed)
              if (passed) {
                const patch = [{
                  op: 'add',
                  path: ['active', claimedDomain, 'admin'],
                  value: user
                }]
                await interact('core', 'core', 'domain-config', patch)
              }
            })
            .catch(error => {
              reportState.error = 'Error claiming domain'
              console.warn('Error claiming admin', claimedDomain, user, error)
            })
        )
      }
    }
  }

  send({ si, ii })
}

async function passDNSOrHTTPChallenge(domain, user, token, report) {
  report.started = Date.now()
  report.attempts = 0
  report.timeout = CHALLENGE_TIMEOUT_LIMIT

  if (MODE === 'local') return true
  else if (domain.startsWith(`${user}.localhost:`)) return true

  let passed = null
  const started = Date.now()
  const wellKnownURL =`https://${domain}/.well-known/knowlearning-admin-challenge`
  while (passed === null) {
    report.attempts += 1
    await Promise.all([
      fetch(wellKnownURL)
        .then(async r => passed = (await r.text()) === token || passed)
        .catch(error => console.warn('DNS_OR_HTTP_CHALLENGE http fetch error', domain, user, error)),
      resolveTXT(domain)
        .then(r => passed = r.includes(token) || passed)
    ])
    const elapsed = Date.now() - started
    if (passed) {
      delete report.timeout
      break
    }
    else if (elapsed > CHALLENGE_TIMEOUT_LIMIT) {
      report.timeout = 0
      passed = false
      break
    }
    else {
      console.log('DNS_OR_HTTP_CHALLENGE trying again', CHALLENGE_TIMEOUT_LIMIT, elapsed)
      report.timeout = CHALLENGE_TIMEOUT_LIMIT - elapsed
      await new Promise(r => setTimeout(r, 1000 - elapsed))
    }
  }

  report.success = passed
  return passed
}

async function resolveTXT(domain) {
  try { return await dnsPromises.resolveTxt(domain).then(r => r.flat()) }
  catch (err) { return [] }
}
