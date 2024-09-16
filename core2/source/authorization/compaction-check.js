import { encodeJSON, applyPatch, standardJSONPatch } from './externals.js'
import { js, jsm } from './nats.js'
import { upload, download, concat } from './storage.js'
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
  const messages = await (await js.consumers.get(stream)).consume()
  let file = ''
  let state, metadata

  for await (const message of messages) {
    const patch = message.json()
    if (message.seq === seq) break
    if (!state) {
      const snapshot = await getSnapshotState(patch)
      state = snapshot.state
      metadata = snapshot.metadata
      previousSnapshotId = snapshot.last
      console.log('STATE SNAPSHOT!!!!!!!!!!', state, metadata)
    }

    const timestamp = Math.round(message.info.timestampNanos/1_000_000)
    const serializedPatch = JSON.stringify(patch)

    metadata = applyStandardPatch(metadata, patch.filter(op => op.metadata))
    state = applyStandardPatch(state, patch.filter(op => !op.metadata))

    file += `${message.seq} ${timestamp} ${serializedPatch}\n`
    message.ack()
  }
  messages.close()

  file += JSON.stringify([
    { metadata: true, op: 'replace', path: [], value: metadata },
    { op: 'replace', path: [], value: state }
  ]) + '\n'

  const type = 'text/plain'
  const targetId = previousSnapshotId ? uploadId : composeId
  const { url, info } = await upload(type, targetId, true)
  await Agent.create({ id: targetId, active: info })

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': type },
    body: file
  })

  if (response.status === 200) {
    // TODO: compose the new file and old file (if exists
    if (previousSnapshotId) {
      await concat([previousSnapshotId, uploadId], composeId)
    }
    await jsm.streams.purge(stream, { seq })
  }
}

async function getSnapshotState(patch) {
  let state = {}
  let metadata = {}

  if (patch[0].path[0] === 'snapshot') {
    const snapshotId = patch[0].value
    const file = await fetch(await download(snapshotId, 3, true)).then(r => r.text())
    file.split('\n').forEach(line =>  {
      if (/^\d+$/.test(line[0])) {
        //  TODO: handle errors gracefully
        const { patch } = parseShapshotLine(line)
        metadata = applyStandardPatch(metadata, patch.filter(op => op.metadata))
        state = applyStandardPatch(state, patch.filter(op => !op.metadata))
      }
    })
    return { state, metadata, last: snapshotId }
  }
  else return { state, metadata }
}

function parseShapshotLine(line) {
  const seq = line.substring(0, line.indexOf(' '))
  const timestamp = line.substring(seq.length + 1, line.indexOf(' ', seq.length + 1))
  const patch = line.substring(seq.length + timestamp.length + 2)
  return { seq: parseInt(seq), timestamp: parseInt(timestamp), patch: JSON.parse(patch) }
}

function applyStandardPatch(state, patch) {
  const lastResetPatchIndex = patch.findLastIndex(p => p.path.length === 0)
  if (lastResetPatchIndex > -1) state = patch[lastResetPatchIndex].value
  const JSONPatch = standardJSONPatch(patch.slice(lastResetPatchIndex + 1))
  return applyPatch(state, JSONPatch).newDocument
}
