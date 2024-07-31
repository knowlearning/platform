import { decodeJSON, NATSClient } from './externals.js'

const natsClient = await NATSClient({ servers: "nats://nats-server:4222" })
const jetstreamManager = await natsClient.jetstreamManager()
const jetstreamClient = natsClient.jetstream()

async function getFirstMessage(subject) {

  const streamInfo = await jetstreamManager.streams.info(subject)

  // Check if there are messages in the stream
  if (streamInfo.state.messages === 0) {
    console.log("No messages in the stream.")
    return
  }

  const opts = { max: 1, ackWait: 30 * 1000 }
  const ps = await jetstreamClient.pullSubscribe(subject, { config: { durable_name: "my_consumer", deliver_group: "my_group" }, opts });
  const messages = await ps.pull({ batch: 1, expires: 5000 })


  let md
  //  TODO: decide if this is good enough in a world where metadata is immutable
  for await (const message of messages) {
    message.ack()
    md = decodeJSON(message.data)[0].value
    break
  }
  return md
}

export default async function metadata(subject) {
    const firstMessage = await getFirstMessage(subject)
    return firstMessage
}