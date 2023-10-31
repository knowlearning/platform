import { promises as dnsPromises } from 'dns'
import crypto from 'crypto'
import { v4 as uuid } from 'uuid'
import interact from '../interact/index.js'
import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'

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
      if (path.length === 2 && path[0] === 'active' && path[1] === 'domain') {
        const token = crypto.randomBytes(64).toString('hex')
        const claimedDomain = value

        //  Make sure the domain config is initialized
        redis.client.json.set('domain-config', `$["active"][${JSON.stringify(claimedDomain)}]`, {}, { NX: true })

        const report = uuid()
        send({ si, ii, token, report })

        const reportState = coreState(report, domain)
        reportState.started = Date.now()

        return (
          passDNSOrHTTPChallenge(claimedDomain, user, token)
            .then(async passed => {
              console.log('DNS_OR_HTTP_CHALLENGE PASSED?', claimedDomain, user, passed)
              if (passed) {
                reportState.success = Date.now()
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

async function passDNSOrHTTPChallenge(domain, user, token) {
  if (MODE === 'local') return true
  else if (domain.startsWith(`${user}.localhost:`)) return true

  let passed = false
  const started = Date.now()
  const wellKnownURL =`https://${domain}/.well-known/knowlearning-admin-challenge`
  while (!passed) {
    console.log('DNS_OR_HTTP_CHALLENGE CHECKING IF PASSING!!!', domain, user, token)
    await Promise.all([
      fetch(wellKnownURL).then(async r => {
        console.log('DNS_OR_HTTP_CHALLENGE TEXT VALUE AT WELL KNOWN PATH', domain, user, await r.text(), token)
        passed = passed || await r.text() === token
      }),
      resolveTXT(domain).then(r => {
        console.log('DNS_OR_HTTP_CHALLENGE TXT RECORD VALUE', domain, user, r, token)
        passed = passed || r.includes(token)
      })
    ])
    const elapsed = Date.now() - started
    if (passed || elapsed > CHALLENGE_TIMEOUT_LIMIT) break
    console.log('DNS_OR_HTTP_CHALLENGE STILL WAITING', domain, user, elapsed, CHALLENGE_TIMEOUT_LIMIT)
  }
  return passed
}

async function resolveTXT(domain) {
  try { return await dnsPromises.resolveTxt(domain).then(r => r.flat()) }
  catch (err) { return [] }
}
