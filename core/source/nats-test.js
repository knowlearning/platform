import { uuid, nats } from './utils.js'

const jsonCodec = nats.JSONCodec()

const subject = 'a'

const nc = await nats.connect({ server: '0.0.0.0:4222' })

console.log('GOT CLIENT')

// create the stream
const jsm = await nc.jetstreamManager();

console.log('GOT JSM')

await jsm.streams.add({ name: subject });

console.log('ADDED STREAM')

// create a jetstream client:
const js = nc.jetstream();

// publish a message received by a stream
let pa = await js.publish(subject, jsonCodec.encode({ hello: 'world' }));

console.log('PUBLISHED MESSAGE')

// jetstream returns an acknowledgement with the
// stream that captured the message, it's assigned sequence
// and whether the message is a duplicate.
const stream = pa.stream;
const seq = pa.seq;
const duplicate = pa.duplicate;
const Empty = nats.Empty;

// More interesting is the ability to prevent duplicates
// on messages that are stored in the server. If
// you assign a message ID, the server will keep looking
// for the same ID for a configured amount of time (within a
// configurable time window), and reject messages that
// have the same ID:
await js.publish(subject, Empty, { msgID: "a" });

console.log('PUBLISHED MESSAGE WITH ID????')

// you can also specify constraints that should be satisfied.
// For example, you can request the message to have as its
// last sequence before accepting the new message:
await js.publish(subject, Empty, { expect: { lastMsgID: "a" } });
await js.publish(subject, Empty, { expect: { lastSequence: 3 } });
// save the last sequence for this publish
pa = await js.publish(subject, Empty, { expect: { streamName: "a" } });
// you can also mix the above combinations

// this stream here accepts wildcards, you can assert that the
// last message sequence recorded on a particular subject matches:
const buf = [];
for (let i = 0; i < 100; i++) {
  buf.push(js.publish(subject, Empty));
}
await Promise.all(buf);
// if additional "a.b" has been recorded, this will fail
//await js.publish("a.b", Empty, { expect: { lastSubjectSequence: pa.seq } });

async function consumeMessages(label) {
  const c = await js.consumers.get("a");
  const messages = await c.consume({ max_messages: 1000 });
  for await (const m of messages) {
    console.log(label, m.seq);
    m.ack();
  }
}

consumeMessages('a')

setTimeout(async () => {
  await jsm.streams.purge(stream, { seq: 90 })
  consumeMessages('b')
}, 2000)