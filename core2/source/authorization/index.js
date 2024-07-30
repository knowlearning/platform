import { connect, JSONCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'

const nc = await connect({ servers: "nats://nats-server:4222" })

const {
  encode: encodeJSON,
  decode: decodeJSON
} = JSONCodec()

const subscription = nc.subscribe(">", { queue: "all-streams-queue" })

function isSession(subject) {
  return true
}

for await (const message of subscription) {
  try {
    if (isSession(message.subject)) {
      const patch = decodeJSON(message.data)
      for (const { path, metadata } of patch) {
        if (!metadata && path[path.length-2] === 'uploads') {
          nc.publish(
            message.subject,
            encodeJSON([{
              op: 'add',
              path: [...path, 'url'],
              value: 'URL!!!!!!!!!!!!!!!!!! from the back end...'
            }])
          )
        }
      }
    }
  } catch (error) {
    console.log('error decoding JSON', error, message.data)
  }
}
