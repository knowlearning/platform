import { connect, JSONCodec } from 'nats.ws'
import PatchProxy from '@knowlearning/patch-proxy'
import { login, logout } from './authentication.js'

const { host } = window.location

const { encode: encodeJSON, decode: decodeJSON } = JSONCodec()
const natsClientPromise = connect({ servers: ['ws://localhost:8080'] })
const userPromise = new Promise(r => r('me'))

export default {
  login,
  logout,
  state,
  watch
}

async function watch(scope, callback, user=userPromise, domain=host) {
  user = await user

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

async function state(scope, user=userPromise, domain=host) {
  user = await user

  const client = await natsClientPromise  
  const subject = `${domain}.${user}.${scope}`

  const startState = {} //  TODO: subscribe and construct...
  return new PatchProxy(startState, patch => {
    //  TODO: reject updates if user is not owner
    const activePatch = structuredClone(patch)
    activePatch.forEach(entry => entry.path.unshift('active'))
    const payload = encodeJSON(patch)
    client.publish(subject, payload)
  })
}