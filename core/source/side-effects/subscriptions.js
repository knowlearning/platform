import { validate as isUUID } from 'uuid'
import * as redis from '../redis.js'
import subscribe from '../subscribe.js'
import configuration from '../configuration.js'
import initializationState from '../initialization-state.js'
import scopeToId from '../scope-to-id.js'
import subscriptions from '../subscriptions.js'

export default async function ({ domain, user, session, scope, patch, si, ii, send }) {
  const config = await configuration(domain)
  for (let index = 0; index < patch.length; index++) {
    const { path, op, value} = patch[index]

    if (op === 'add' && path.length === 1 && path[0] === 'active') {
      //const [id] = path //  TODO: track deletes of id in sessions object to unhook subscriptions
      let { scope, user:scopeUser=user, domain:scopeDomain=domain } = value

      //  TODO: authorization check here
      if (!subscriptions[session]) subscriptions[session] = {}

      const ss = subscriptions[session]
      const id = await scopeToId(scopeDomain, scopeUser, scope)
      if (!ss[id]) ss[id] = subscribe(id, send, scope)
      await redis.connected //  TODO: assess if necessary
      let state = await redis.client.json.get(id)
      if (!state) {
        state = initializationState(domain, user, scope)
        //  TODO: ensure set was successful, otherwise just retry get
        if (scopeUser === user) await redis.client.json.set(id, '$', state, { NX: true }) // initialize metadata if does not exist
      }
      send({ ...state, id, si })
      return
    }
  }

  send({ si, ii })
}
