import { createGCSClient, nats, environment, uuid } from './utils.js'
import { downloadURL } from './storage.js'

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

function upload(id, data) {
  return new Promise((resolve, reject) => {
    const file = bucket.file(id)
    const stream = file.createWriteStream({ metadata: { contentType: "text/plain" } })
    stream.end(data)
    stream.on("finish", () => {
      console.log(`String content uploaded to ${id}`)
      resolve()
    })

    stream.on("error", error => {
      console.error("Error uploading string content:", error)
      reject(error)
    })
  })
}




const client = await nats.connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()
const js = client.jetstream()
const jc = nats.JSONCodec()

poll()

async function poll() {
  const streams = await jsm.streams.list().next()
  await Promise.all(
    streams.map(async ({ config, state }) => {
      if (state.bytes > 1000) {
        console.log('BIG STREAM!!!!!!!!!!', config, state)
        const c = await js.consumers.get(config.name)
        const messages = await c.consume({ max_messages: 1000 })
        const messagesToSerialize = []

console.log('MAKING UUID')
        const id = uuid()
console.log('MADE UUID', id)
        const snapshot = await js.publish(config.name, jc.encode({ id }));

        for await (const m of messages) {
          if (snapshot.seq < m.seq) {
            messagesToSerialize.push(jc.decode(m.data))
            m.ack()
          }
          else break
        }
        console.log('UPLOADING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        try {
          await upload(id, messagesToSerialize.map(m => JSON.stringify(m)).join('\n'))
          console.log(
            'UPLOADED TO', id,
            await downloadURL(id)
          )
          await jsm.streams.purge(config.name, { seq: snapshot.seq })
          console.log('PURGED THE OLD STUFF', id)
        }
        catch (error) {
          console.error('ERROR UPLOADING ROLLED UP STATE', error)
        }
      }
    })
  )
  setTimeout(poll, 5000)
}
