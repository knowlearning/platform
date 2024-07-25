import { connect, JSONCodec } from 'nats.ws'

const { encode: encodeJSON, decode: decodeJSON } = JSONCodec()
const natsClientPromise = connect({ servers: ['ws://localhost:8080'] })

const jetstreamManagerPromise =  natsClientPromise.then(c => c.jetstreamManager())
const jetstreamClientPromise = natsClientPromise.then(c => c.jetstream())

export async function process(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const jetstreamClient = await jetstreamClientPromise
  await jetstreamManager.streams.add({ name: subject })

  const c = await jetstreamClient.consumers.get(subject)
  const historyLength = (await jetstreamManager.streams.info(subject)).state.messages
  const messages = await c.consume({ max_messages: 1000 })
  return { messages, historyLength }
}

export async function publish(subject, patch, expectFirstPublish) {
  const client = await jetstreamClientPromise
  let options
  if (expectFirstPublish) {
    const jetstreamManager = await jetstreamManagerPromise
    await jetstreamManager.streams.add({ name: subject })
    options =  { expect: { lastSequence: 0 } }
  }
  // TODO: actually put in expectation for first message
  await client.publish(subject, encodeJSON(structuredClone(patch)), options)
}

export async function inspect(subject) {
  const jetstreamManager = await jetstreamManagerPromise
  const { first_ts, last_ts} = (await jetstreamManager.streams.info(subject)).state

  return {
    created: (new Date(first_ts)).getTime(),
    updated: (new Date(last_ts)).getTime()
  }
}

export { encodeJSON, decodeJSON }
