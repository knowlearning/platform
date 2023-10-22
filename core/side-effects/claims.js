import crypto from 'crypto'
import interact from '../interact/index.js'
import * as redis from '../redis.js'
import initializationState from '../initialization-state.js'

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

    if (!MODE === 'local') {} //  TODO: await DNS TXT record challenge pass (ping DNS TXT record until matches token)

    await interact('core', 'core', 'domain-config', [{
      op: 'add',
      path: ['active', claimedDomain, 'admin'],
      value: user
    }])
  }
  else send({ si, ii })
}
