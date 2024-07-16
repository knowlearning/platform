import { nats } from './utils.js'
import { upload, downloadURL } from './storage.js'

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

        const { url, info: { id } } = await upload('text/plain', true)
        const snapshot = await js.publish(config.name, jc.encode({ id }));

        //  TODO: stop watching when we get to message we put in...
        for await (const m of messages) {
          if (snapshot.seq < m.seq) {
            messagesToSerialize.push(jc.decode(m.data))
            m.ack()
          }
          else break
        }
        console.log('UPLOADING!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!')
        const response = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'text/plain' },
          body: messagesToSerialize.map(m => JSON.stringify(m)).join('\n')
        })
        console.log('UPLOAD RESPONSE!!!!!!', response, await response.json())
        console.log(
          'UPLOADED TO', id,
          await downloadURL(id)
        )
        if (response.status === 200) {
          await jsm.streams.purge(config.name, { seq: snapshot.seq })
          console.log('PURGED THE OLD STUFF', id)
        }
        else {
          console.log('ISSUES SAVING THE OLD STUFF', id)
        }
      }
    })
  )
  setTimeout(poll, 5000)
}

async function uploadMessagesFromStream(streamName, subject, endpoint) {

  // Pull all messages from the stream
  let messages = [];
  const p = await js.pullSubscribe(subject, { config: { durable_name: "my_durable" } });

  for await (const m of p) {
    messages.push(jc.decode(m.data));
    m.ack();
  }

  // Concatenate all messages with \n
  const concatenatedMessages = messages.map(msg => JSON.stringify(msg)).join('\n');
  
  // Send concatenated messages via a POST request
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: concatenatedMessages,
  });

  if (!response.ok) {
    throw new Error(`Failed to upload messages: ${response.statusText}`);
  }

  console.log('Messages uploaded successfully');
  
  // Close the NATS connection
  await nc.close();
}