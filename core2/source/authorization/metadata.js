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

  console.log('PULLING MESSAGE FROM SUBJECT', subject, 'WITH', streamInfo.state.messages, 'MESSAGES')

  return decodeJSON(firstMessage.data)
}

export default async function metadata(subject) {
  const firstMessage = await getFirstMessage(subject)
  return firstMessage
}