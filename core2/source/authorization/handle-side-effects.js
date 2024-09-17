import {
  encodeJSON,
  decodeJSON,
  decodeNATSSubject
} from './externals.js'
import { upload, download } from './storage.js'
import { nc } from './nats.js'
import configure from './configure.js'
import configuredQuery from './configured-query.js'
import handleRelationalUpdate from './handle-relational-update.js'
import compactionCheck from './compaction-check.js'
import Agent from './agent/deno/deno.js'
import handleCacheUpdate, { getCache } from './handle-cache-update.js'

function isSession(subject) {
  return subject.split('.')[4] === 'sessions'
}

export default async function handleSideEffects(error, message) {
  const { subject, data } = message
  try {
    const originalSubject = subject.substring(subject.indexOf('.') + 1)
    const streamId = message.headers.headers.get('Nats-Stream')[0]
    const seq = parseInt(message.headers.headers.get('Nats-Sequence')[0])
    const respond = response => {
      nc
        .publish(
          `responses.${originalSubject}`,
          encodeJSON({...response, id: streamId, seq})
        )
    }
    if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (metadata) continue
        else if (path[path.length-2] === 'uploads') {
          const { id, type } = value
          //  TODO: ensure id is uuid
          const { url, info } = await upload(type, id)
          Agent.create({ id, active: info })
          respond({ value: url })
        }
        else if (path[path.length-2] === 'subscriptions') {
          respond({ value: await getCache(value.id) })
        }
        else if (path[path.length-2] === 'downloads') {
          respond({ value: await download(value.id) })
        }
        else if (path[path.length-2] === 'queries') {
          const [domain, user] = decodeNATSSubject(subject.substring(subject.indexOf('.') + 1))
          //  TODO: handle cross domain queries
          try {
            const { query } = value
            const { rows } = await configuredQuery(domain, domain, query, [], user)
            respond({ value: { rows }, error })
          }
          catch (error) {
            respond({ error: error.code })
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
        console.log('CONFIGURING DOMAIN', domain, config, report)
        configure(domain, config, report)
      }
      await handleRelationalUpdate(streamId, message)
      await handleCacheUpdate(streamId, message, seq)
      compactionCheck(originalSubject)
        .catch(error => {
          console.warn('ERROR in compaction check', error)
        })
      respond({})
    }
  } catch (error) {
    console.log('error decoding JSON', error, subject, data)
  }
}
