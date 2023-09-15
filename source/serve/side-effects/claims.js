import crypto from 'crypto'
import interact from '../interact.js'
import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'

const { MODE, ADMIN_DOMAIN } = process.env

//  TODO: remove need for core to have initialization state and rely on
//        side effects for individual application/json;type=claim scopes
redis.connected.then(() => {
  const state = initializationState('core', 'core')
  redis.client.json.set('domain-config', '$', state, { NX: true })
})

export default async function claims(domain, user, session, patch, si, ii, send) {
  if (domain === ADMIN_DOMAIN || MODE === 'local') { //  can claim from any domain on local
    const claimedDomain = patch[0].path[1]
    const token = crypto.randomBytes(64).toString('hex')
    if (MODE === 'local') {
      await interact('core', 'core', 'domain-config', [{
        op: 'add',
        path: ['active', claimedDomain],
        value: { admin: user }
      }])
    }
    else {
      //  TODO: ping DNS TXT record for token, and only set if the domain is actually set to token
      await interact('core', 'core', 'domain-config', [{
        op: 'add',
        path: ['active', claimedDomain],
        value: { admin: user }
      }])
    }
    send({ si, ii, token })
  }
  else send({ si, ii })
}
