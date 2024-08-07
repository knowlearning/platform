import { NATSClient, encodeJSON, decodeJSON } from './externals.js'
import { upload, download } from './storage.js'
import Agent from './agent/deno/deno.js'
import configure from './configure.js'

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
          console.log('pppppppppppppppp', SESSION_ID, isClaim(subject), patch)
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
        if (metadata) continue
        else if (path[path.length-2] === 'uploads') {
          console.log('UPLOAD??????????????????????')
          const { id } = value
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
          message.respond(encodeJSON({ value: url }))

        }
        else if (path[path.length-2] === 'downloads') {
          console.log('DOWLOADS!!!!!!!!', value)
          message.respond(encodeJSON({
            value: await download(value.id)
          }))
        }
        else if (path[path.length-2] === 'queries') {
          const id = path[path.length-1]
          //  TODO: ensure id is uuid
          console.log('can we respond??????????????????????????????', message.respond)
          message.respond(encodeJSON({
            value: 'yep!!!! TODO: do something more....'
          }))
        }
      }
    }
    else {
      const patch = decodeJSON(data)
      if (patch.length === 2 && patch[0].metadata && patch[0].value.type === 'application/json;type=domain-config') {
        const { config, report, domain } = patch[1].value
        configure(domain, config, report)
      }
    }
  } catch (error) {
    console.log('error decoding JSON', error, subject, data)
  }
}
