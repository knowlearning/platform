import { NATSClient, JSONCodec } from './externals.js'
import { upload, download } from './storage.js'

const nc = await NATSClient({ servers: "nats://nats-server:4222" })

const {
  encode: encodeJSON,
  decode: decodeJSON
} = JSONCodec()

const subscription = nc.subscribe(">", { queue: "all-streams-queue" })

function isSession(subject) {
  return true
}

function ignoreSubject(subject) {
  return subject.startsWith('$') || subject.startsWith('_')
}

for await (const { subject, data } of subscription) {
  if (ignoreSubject(subject)) continue
  try {
    if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (!metadata && path[path.length-2] === 'uploads') {
          const id = path[path.length-1]
          //  TODO: ensure id is uuid
          const { type } = value
          const { url, info } = await upload(type, id)
          nc.publish(
            id,
            encodeJSON([
              {
                metadata: true,
                op: 'add',
                path: [],
                value: {
                  domain: 'TODO: add upload domain',
                  user: 'core',
                  scope: id,
                  type
                }
              },
              {
                op: 'add',
                path: [],
                value: info
              }
            ])
          )
          nc.publish(
            subject,
            encodeJSON([{
              op: 'add',
              path: [...path, 'url'],
              value: url
            }])
          )
        }
        else if (!metadata && path[path.length-2] === 'downloads') {
          const id = path[path.length-1]
          //  TODO: ensure id is uuid
          const url = await download(id)
          nc.publish(
            subject,
            encodeJSON([{
              op: 'add',
              path: [...path, 'url'],
              value: url
            }])
          )
        }

      }
    }
  } catch (error) {
    console.log('error decoding JSON', error, message.subject, message.data)
  }
}
