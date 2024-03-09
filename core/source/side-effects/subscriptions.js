import * as redis from '../redis.js'
import subscribe from '../subscribe.js'
import configuration from '../configuration.js'
import scopeToId from '../scope-to-id.js'
import subscriptions from '../subscriptions.js'

export default async function ({ domain, user, session, patch, si, ii, send }) {
  const config = await configuration(domain)
  for (let index = 0; index < patch.length; index++) {
    const { path, op, value} = patch[index]

    if (op === 'add' && path.length === 1 && path[0] === 'active') {
      //const [id] = path //  TODO: track deletes of id in sessions object to unhook subscriptions
      const { scope, user:scopeUser=user, domain:scopeDomain=domain } = value

      //  TODO: authorization check here
      if (!subscriptions[session]) subscriptions[session] = {}

      const ss = subscriptions[session]
      const id = await scopeToId(scopeDomain, scopeUser, scope)
      if (!ss[id]) ss[id] = subscribe(id, send, scope)
      await redis.connected //  TODO: assess if necessary
      const state = await redis.client.json.get(id)
      send({ ...state, id, si })
      return
    }
  }

  send({ si, ii })
}
