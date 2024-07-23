import { connect, JSONCodec } from 'nats.ws'
import PatchProxy from '@knowlearning/patch-proxy'

const { host } = window.location

const { encode: encodeJSON, decode: decodeJSON } = JSONCodec()
const natsClientPromise = connect({ servers: ['ws://localhost:8080'] })
const userPromise = new Promise(r => r('me'))

const jetstreamManagerPromise =  natsClientPromise.then(c => c.jetstreamManager())
const jetstreamClientPromise = natsClientPromise.then(c => c.jetstream())

export async function watch(scope, callback, user=userPromise, domain=host) {
  user = await user
  const subject = `${domain}_${user}_${scope}`

  const jetstreamManager = await jetstreamManagerPromise
  const jetstreamClient = await jetstreamClientPromise
  await jetstreamManager.streams.add({ name: subject })

  const c = await jetstreamClient.consumers.get(subject)
  const historyLength = (await jetstreamManager.streams.info(subject)).state.messages

  ;(async () => {
    const messages = await c.consume({ max_messages: 1000 })
    const history = []
    //  TODO: account for history if old messages were cleared
    for await (const message of messages) {
      if (message.seq < historyLength) {
        history.push(decodeJSON(message.data))
      }
      else if (message.seq === historyLength) {
        //  TODO: construct state
        callback({ history, state: {}, patch: null })
      }
      else {
        callback({ patch: decodeJSON(message.data) })
      }
      message.ack()
    }
  })()

  //  TODO: return unsubscribe function
}

export async function state(scope, user=userPromise, domain=host) {
  user = await user

  let resolveStartState
  const startState = new Promise(r => resolveStartState = r)

  watch(
    scope,
    ({ state }) => resolveStartState(state),
    user,
    domain
  )

  //  TODO: only return patch proxy if user is owner, otherwise
  //        send proxy that just errors on mutation
  return new PatchProxy(
    await startState,
    patch => publish(domain, user, scope, patch)
  )
}

async function publish(domain, user, scope, patch) {
  const subject = `${domain}_${user}_${scope}`
  const client = await jetstreamClientPromise
  await client.publish(subject, encodeJSON(structuredClone(patch)))
}