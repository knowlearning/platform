import { login, logout } from './authentication.js'
import { connect, JSONCodec } from 'nats.ws'

const decodeJSON = JSONCodec()
const natsClientPromise = connect({ servers: ['ws://localhost:8080'] })

export default {
  login,
  logout,
  state,
  watch
}

async function watch(scope, callback, user='me', domain=window.location.host) {
  const client = await natsClientPromise

  const subject = `${domain}.${user}.${scope}`
  const subscription = client.subscribe(subject)

  ;(async () => {
    for await (const message of subscription) {
      callback(decodeJSON(message.data))
    }
  })()

  //  TODO: return unsubscribe function
}

async function state(scope, user, domain) {
  
}
