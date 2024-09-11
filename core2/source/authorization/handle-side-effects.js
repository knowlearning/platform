import {
  encodeJSON,
  decodeJSON,
  decodeNATSSubject
} from './externals.js'
import { upload, download } from './storage.js'
import configure from './configure.js'
import configuredQuery from './configured-query.js'
import handleRelationalUpdate from './handle-relational-update.js'
import { nc } from './nats.js'
import Agent from './agent/deno/deno.js'

function isSession(subject) {
  return subject.split('.')[4] === 'sessions'
}

export default async function handleSideEffects(error, message) {
  const { subject, data } = message
  try {
    const respond = response => {
      const id = message.headers.headers.get('Nats-Stream')[0]
      const seq = parseInt(message.headers.headers.get('Nats-Sequence')[0])
      const responseSubject = `responses.${subject.substring(subject.indexOf('.') + 1)}`
      nc.publish(responseSubject, encodeJSON({...response, id, seq}))
    }
    if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (metadata) continue
        else if (path[path.length-2] === 'uploads') {
          const { id } = value
          //  TODO: ensure id is uuid
          const { type } = value
          const { url, info } = await upload(type, id)
          Agent.create({ id, active: info })
          respond({ value: url })
        }
        else if (path[path.length-2] === 'downloads') {
          respond({ value: await download(value.id) })
        }
        else if (path[path.length-2] === 'queries') {
          const [domain, user] = decodeNATSSubject(subject.substring(subject.indexOf('.') + 1))
          //  TODO: handle cross domain queries
          try {
            const { query } = value
            try {
              const { rows } = await configuredQuery(domain, domain, query, [], user)
              respond({ value: { rows }, error })
            }
            catch (error) {
              respond({ error: error.code })
            }
          }
          catch (error) {
            console.log('error executing postgres query!!!!!', error)
            respond({ error: 'TODO: pass expected error' })
          }
        }
        else if (path[path.length-2] === 'claims') {
          respond({ dns: '', http: '' })
        }
      }
    }
    else {
      const patch = decodeJSON(data)
      if (patch.length === 2 && patch[0].metadata && patch[0].value.type === 'application/json;type=domain-config') {
        const { config, report, domain } = patch[1].value
        console.log('CONFIGURING DOMAAAAAAAAAAAAAAIIIIIIIIINNNNNNN!!!!!!!!!!!!!!', domain, config, report)
        configure(domain, config, report)
      }
      await handleRelationalUpdate(message)
      respond({})
    }
  } catch (error) {
    console.log('error decoding JSON', error, subject, data)
  }
}