import { encodeJSON } from './externals.js'
import { js, jsm } from './nats.js'
import { upload } from './storage.js'
import Agent from './agent/deno/deno.js'

const currentlyCompacting = {}

export default async function compactionCheck(subject) {
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
  const { seq, stream } = await js.publish(subject, encodeJSON([{ metadata: true, op: 'add', path: ['snapshot'], value: uploadId }]))
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
