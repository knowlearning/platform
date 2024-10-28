import { encodeJSON } from './externals.js'
import { js, jsm } from './nats.js'
import { upload, concat } from './storage.js'
import Agent from './agent/deno/deno.js'

const currentlyCompacting = {}

export default async function compactionCheck(subject) {
  if (currentlyCompacting[subject]) return

  const id = await jsm.streams.find(subject)
  const info = await jsm.streams.info(id)

  if (info.state.bytes > 5000 && !currentlyCompacting[subject]) {
    currentlyCompacting[subject] = true
    compact(subject, id)
      .catch(error => console.warn('ERROR COMPACTING', subject, id, error))
      .finally(() => currentlyCompacting[subject] = false)
  }
}

async function compact(subject) {
  const uploadId = Agent.uuid()
  const composeId = Agent.uuid()
  let previousSnapshotId
  const { seq, stream } = await js.publish(subject, encodeJSON([{ metadata: true, op: 'add', path: ['snapshot'], value: composeId }]))
  const messages = await js.consumers.get(stream).then(c => c.consume())
  let file = ''

  for await (const message of messages) {
    const patch = message.json()
    if (previousSnapshotId === undefined) {
      previousSnapshotId =  patch[0].path[0] === 'snapshot' ? patch[0].value : null
    }

    if (message.seq === seq) break

    const timestamp = Math.round(message.info.timestampNanos/1_000_000)
    const serializedPatch = JSON.stringify(patch)

    file += `${message.seq} ${timestamp} ${serializedPatch}\n`
    message.ack()
  }
  messages.close()

  const type = 'text/plain'
  const targetId = previousSnapshotId ? uploadId : composeId
  const { url, info } = await upload(type, targetId, true)

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: file
  })

  if (response.status === 200) {
    // TODO: compose the new file and old file (if exists
    if (previousSnapshotId) {
      await Promise.all([
        Agent.create({ id: composeId, active: info }),
        concat([previousSnapshotId, uploadId], composeId)
      ])
    }
    else await Agent.create({ id: targetId, active: info })

    await jsm.streams.purge(stream, { seq })
  }
}
