import { createGCSClient, nats, environment, uuid, isUUID } from './utils.js'
import { downloadURL } from './storage.js'
import { equals } from "https://deno.land/std@0.224.0/bytes/mod.ts"

const {
  INTERNAL_GCS_API_ENDPOINT,
  GCS_BUCKET_NAME,
  GC_PROJECT_ID,
  GCS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

const storage = new createGCSClient({
  apiEndpoint: INTERNAL_GCS_API_ENDPOINT,
  projectId: GC_PROJECT_ID,
  credentials: JSON.parse(GCS_SERVICE_ACCOUNT_CREDENTIALS)
})

const bucket = storage.bucket(GCS_BUCKET_NAME)

const client = await nats.connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()
const js = client.jetstream()
const jc = nats.JSONCodec()
const sc = nats.StringCodec()

poll()

async function poll() {
  const streams = await jsm.streams.list().next()
  await Promise.all(
    streams.map(async ({ config, state }) => {
      if (state.bytes > 1000000000) {
        const c = await js.consumers.get(config.name)
        const messages = await c.consume({ max_messages: 1000 })
        const messagesToSerialize = []

        const id = uuid()
        const snapshot = await js.publish(config.name, sc.encode(id))
        let first = true
        let idToConcat = null

        for await (const m of messages) {
          if (first) {
            first = false
            if (bufferIsUUID(m.data)) idToConcat = new TextDecoder().decode(m.data)
          }

          if (snapshot.seq > m.seq) {
            messagesToSerialize.push(m.data)
            m.ack()
          }
          else break
        }
        try {
          //  TODO: investigate guarantees
          const data = concatenateWithNewlines(messagesToSerialize)
          if (idToConcat) {
            const tmpId = uuid()
            await bucket.file(tmpId).save(data)
            const sources = [ bucket.file(idToConcat), bucket.file(tmpId) ]
            await bucket.combine(sources, id)
          }
          else await bucket.file(id).save(data)
          await jsm.streams.purge(config.name, { seq: snapshot.seq })
        }
        catch (error) { console.error('ERROR UPLOADING ROLLED UP STATE', error) }
      }
    })
  )
  setTimeout(poll, 5000)
}

// Create a newline Uint8Array
const newline = new TextEncoder().encode('\n');

// Function to concatenate buffers with newlines in between
function concatenateWithNewlines(buffers) {
  const totalLength = buffers.reduce((acc, buffer) => acc + buffer.length, 0) + (buffers.length - 1) * newline.length
  const result = new Uint8Array(totalLength)

  let offset = 0
  buffers.forEach((buffer, index) => {
    result.set(buffer, offset)
    offset += buffer.length;
    if (index < buffers.length - 1) {
      result.set(newline, offset)
      offset += newline.length
    }
  })

  return result
}

function bufferIsUUID(uint8Array) {
  const str = new TextDecoder().decode(uint8Array)
  return isUUID(str)
}
