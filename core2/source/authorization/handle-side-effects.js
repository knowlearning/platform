import {
  encodeJSON,
  decodeJSON,
  decodeNATSSubject
} from './externals.js'
import { upload, download } from './storage.js'
import configure from './configure.js'
import configuredQuery from './configured-query.js'
import handleRelationalUpdate from './handle-relational-update.js'
import { nc, js, jsm } from './nats.js'
import Agent from './agent/deno/deno.js'

function isSession(subject) {
  return subject.split('.')[4] === 'sessions'
}

export default async function handleSideEffects(error, message) {
  const { subject, data } = message
  const originalSubject = subject.substring(subject.indexOf('.') + 1)
  try {
    const respond = response => {
      const id = message.headers.headers.get('Nats-Stream')[0]
      const seq = parseInt(message.headers.headers.get('Nats-Sequence')[0])
      const responseSubject = `responses.${originalSubject}`
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

const currentlyCompacting = {}

async function compactionCheck(subject) {
  if (currentlyCompacting[subject]) return

  const id = await jsm.streams.find(subject)
  const size = (await jsm.streams.info(id)).state.bytes

  if (size > 1000 && !currentlyCompacting[subject]) {
    currentlyCompacting[subject] = true
    compact(subject, id)
      .catch(error => console.warn('ERROR COMPACTING', subject, id, error))
      .finally(() => currentlyCompacting[subject] = false)
  }
}

async function compact(subject) {
  const uploadId = Agent.uuid()
  const { seq, stream } = await js.publish(subject, JSONCodec().encode([{ metadata: true, op: 'add', path: ['snapshot'], value: uploadId }]))
  const messages = await (await js.consumers.get(stream)).consume()
  let file = ''

  for await (const message of messages) {
    if (message.seq === seq) break

    file += JSON.stringify(message.json()) + '\n'
  }
  messages.close()

  const type = 'text/plain'
  const { url, info } = await upload(type, uploadId, true)
  await Agent.create({ id: uploadId, active: info })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: file
  })

  if (response.status === 200) {
    // TODO: purge all messages up to seq
  }
}
