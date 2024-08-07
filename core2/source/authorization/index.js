import { NATSClient, encodeJSON, decodeJSON, encodeString, decodeString } from './externals.js'
import { upload, download } from './storage.js'
import { decodeNATSSubject } from './agent/utils.js'
import configure from './configure.js'

const nc = await NATSClient({ servers: "nats://nats-server:4222" })


const jsm = await nc.jetstreamManager()
const js = await nc.jetstream()

;(async () => {
  await jsm.streams.add({ name: 'postgres-metadata' })
  const oc = await js.consumers.get('postgres-metadata')
  const messages = await oc.consume()
  for await (const message of messages) {
    const { subject, update } = decodeJSON(message.data)
    const [domain, owner, name] = decodeNATSSubject(subject)
    console.log('create or insert', {...update, domain, owner, name })
  }
})()












const subscription = nc.subscribe(">", { queue: "all-streams-queue" })

function isSession(subject) {
  return subject.split('.')[2] === 'sessions'
}

function isClaim(subject) {
  return subject.split('.')[2] === 'claims'
}

function ignoreSubject(subject) {
  return subject.startsWith('$') ||
    subject.startsWith('_') ||
    subject === 'postgres-metadata' ||
    subject.split('.').length !== 3
}

for await (const message of subscription) {
  const { subject, data } = message
  if (ignoreSubject(subject)) continue
  try {
    if (isClaim(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata } of patch) {
        if (!metadata && path.length === 1) {
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
    }
    else if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (metadata) continue
        else if (path[path.length-2] === 'uploads') {
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
          message.respond(encodeJSON({
            value: await download(value.id)
          }))
        }
        else if (path[path.length-2] === 'queries') {
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
    const patch = decodeJSON(data)
    const metadataPatch = patch.filter(({metadata})=> metadata)
    if (metadataPatch.length) {
      const update = metadataPatch.reduce((acc, { path, value }) => {
        if (path.length) {
          acc[path[0]] = value
          return acc
        }
        else return value
      }, {})
      //  TODO: gather all updated fields for metadata
      js.publish('postgres-metadata', encodeJSON({subject, update}))
    }
    //  TODO: push metadata updates to a stream
  } catch (error) {
    console.log('error decoding JSON', error, subject, data)
  }
}
