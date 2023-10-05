import * as redis from '../redis.js'
import subscribe from '../subscribe.js'
import configuration from '../configuration.js'
import initializationState from '../initialization-state.js'
import scopeToId from '../scope-to-id.js'

const subscriptions = {}

export default async function (domain, user, session, patch, si, ii, send) {
  const config = await configuration(domain)
  const { path, op, value} = patch[0]

  if (op === 'add' && path.length === 1 && path[0] === 'active') {
    //const [id] = path //  TODO: track deletes of id in sessions object to unhook subscriptions
    const { scope } = value

    //  TODO: authorization check here
    if (!subscriptions[session]) subscriptions[session] = {}

    const ss = subscriptions[session]
    const id = await scopeToId(domain, user, scope)
    if (!ss[id]) ss[id] = subscribe(id, send, scope)
    await redis.connected //  TODO: assess if necessary
    let state = await redis.client.json.get(id)
    if (!state) {
      state = initializationState(domain, user, scope)
      //  TODO: ensure set was successful, otherwise just retry get
      await redis.client.json.set(id, '$', state, { NX: true }) // initialize metadata if does not exist
    }
    send({ ...state, id, si })
  }
  else send({ si, ii }) // non-side-effect inducing patch
}