import { NATSClient, encodeJSON, decodeJSON } from './externals.js'
import { upload, download } from './storage.js'
import Agent from './agent/deno/deno.js'

const nc = await NATSClient({ servers: "nats://nats-server:4222" })

const subscription = nc.subscribe(">", { queue: "all-streams-queue" })

const SESSION_ID = Agent.uuid()

function isSession(subject) {
  return subject.split('.')[2] === 'sessions'
}

function isClaim(subject) {
  return subject.split('.')[2] === 'claims'
}

function ignoreSubject(subject) {
  return subject.startsWith('$') || subject.startsWith('_')
}

for await (const message of subscription) {
  const { subject, data } = message
  if (ignoreSubject(subject)) continue
  try {
    if (isClaim(subject)) {
      const patch = decodeJSON(data)
      console.log('hmmmm')
      for (const { path, metadata } of patch) {
        if (!metadata && path.length === 1) {
          console.log('pppppppppppppppp', SESSION_ID, message, isClaim(subject), patch)
          nc.publish(
            subject,
            encodeJSON([{
              op: 'add',
              path: [...path, 'challenges'],
              value: {
                dns: '',
                http: ''
              }
            }])
          )
        }
      }
      console.log('-------')
    }
    else if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (!metadata && path[path.length-2] === 'uploads') {
          console.log('UPLOAD??????????????????????')
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
    console.log('error decoding JSON', error, subject, data)
  }
}
