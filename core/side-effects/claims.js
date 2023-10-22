import { promises as dnsPromises } from 'dns'
import crypto from 'crypto'
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

export default async function claims({ domain, user, session, scope, patch, si, ii, send }) {
  if (domain === ADMIN_DOMAIN || MODE === 'local') { //  can claim from any domain on local
    const claimedDomain = patch[0].path[1]
    const token = crypto.randomBytes(64).toString('hex')

    //  Make sure the domain config is initialized
    redis.client.json.set('domain-config', `$["active"][${JSON.stringify(claimedDomain)}]`, {}, { NX: true })

    send({ si, ii, token })

    passDNSOrHTTPChallenge(claimedDomain, user, token)
      .then(async passed => {
        if (passed) {
          const patch = [{
            op: 'add',
            path: ['active', claimedDomain, 'admin'],
            value: user
          }]
          await interact('core', 'core', 'domain-config', patch)
        }
      })
      .catch(error => console.warn('Error claiming admin', claimedDomain, user, error))
  }
  else send({ si, ii })
}

async function passDNSOrHTTPChallenge(domain, user, token) {
  if (MODE === 'local') return true
  else if (domain.startsWith(`${user}.localhost:`)) return true

  let passed = false
  const started = Date.now()
  const wellKnownURL =`https://${domain}/.well-known/knowlearning-admin-challenge`
  while (!passed) {
    await Promise.all([
      fetch(wellKnownURL).then(async r => passed = passed || await r.text() === token),
      resolveTXT(domain).then(r => passed = passed || r.includes(token))
    ])
    const elapsed = Date.now() - started
    if (passed || elapsed > CHALLENGE_TIMEOUT_LIMIT) break
  }
  return passed
}

async function resolveTXT(domain) {
  try { return await dnsPromises.resolveTxt(domain).then(r => r.flat()) }
  catch (err) { return [] }
}
