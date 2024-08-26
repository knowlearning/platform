import {
  encodeJSON,
  decodeJSON
} from './externals.js'
import { upload, download } from './storage.js'
import configure from './configure.js'
import Agent from './agent/deno/deno.js'

function isSession(subject) {
  return subject.split('.')[2] === 'sessions'
}

function ignoreSubject(subject) {
  return subject.startsWith('$') ||
    subject.startsWith('_') ||
    subject === 'postgres-sync' ||
    subject.split('.').length !== 3
}

export default async function handleSideEffects(error, message) {
  const { subject, data } = message
  if (ignoreSubject(subject)) return

  try {
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
        else if (path[path.length-2] === 'claims') {
          message.respond(encodeJSON({ dns: '', http: '' }))
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