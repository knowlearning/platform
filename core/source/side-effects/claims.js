import { environment, uuid, randomBytes, PatchProxy } from '../utils.js'
import coreState from '../core-state.js'
import interact from '../interact/index.js'
import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'

const CHALLENGE_TIMEOUT_LIMIT = 1000 * 60 * 5

const { MODE, ADMIN_DOMAIN } = environment

//  TODO: remove need for core to have initialization state and rely on
//        side effects for individual application/json;type=claim scopes
redis.connected.then(() => {
  const state = initializationState('core', 'core')
  redis.client.json.set('domain-config', '$', state, { NX: true })
})

export default async function claims({ domain, user, session, patch, si, ii, send }) {
  if (domain === ADMIN_DOMAIN || MODE === 'local') { //  can claim from any domain on local
    for (let index = 0; index < patch.length; index ++) {
      const { path, value } = patch[index]
      console.log('CHECKING CLAIM PATCH', domain, user, patch[index])
      if (path.length === 1 && path[0] === 'active') {
        const token = randomBytes(64, 'hex')
        const claimedDomain = value.domain //  TODO: graceful fail

        //  Make sure the domain config is initialized
        redis.client.json.set('domain-config', `$["active"][${JSON.stringify(claimedDomain)}]`, {}, { NX: true })

        const report = uuid()
        send({ si, ii, token, report })

        const reportState = await coreState(user, report, domain)

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
  const wellKnownURL =`https://${domain}/.well-known/knowlearning-admin-challenge`
  while (passed === null) {
    const started = Date.now()
    report.attempts += 1
    await Promise.all([
      fetch(wellKnownURL)
        .then(async r => passed = (await r.text()) === token || passed)
        .catch(error => console.warn('DNS_OR_HTTP_CHALLENGE http fetch error', domain, user, error)),
      resolveTXT(domain)
        .then(r => passed = r.includes(token) || passed)
    ])
    const elapsed = Date.now() - started
    const totalElapsed = Date.now() - report.started
    if (passed) {
      delete report.timeout
      break
    }
    else if (totalElapsed > CHALLENGE_TIMEOUT_LIMIT) {
      report.timeout = 0
      passed = false
      break
    }
    else {
      report.timeout = CHALLENGE_TIMEOUT_LIMIT - totalElapsed
      await new Promise(r => setTimeout(r, 1000 - elapsed))
    }
  }

  report.success = passed
  return passed
}

async function resolveTXT(domain) {
  try { return await Deno.resolveDns(domain, 'TXT').then(r => r.flat()) }
  catch (err) { return [] }
}
