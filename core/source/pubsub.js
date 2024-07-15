import { nats } from './utils.js'

const client = await nats.connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()
const js = client.jetstream()
const jsonCodec = nats.JSONCodec()

export async function publish(scope, update) {
  await jsm.streams.add({ name: scope })
  const pa = await js.publish(scope, jsonCodec.encode(update))
}

export async function subscribe() {

}