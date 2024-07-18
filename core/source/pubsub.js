import { JSONCodec, connect } from "https://deno.land/x/nats@v1.28.0/src/mod.ts"

const client = await connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()
const js = client.jetstream()
const jsonCodec = JSONCodec()

export async function publish(scope, update) {
  await jsm.streams.add({ name: scope })
  await js.publish(scope, jsonCodec.encode(update))
}

export async function subscribe(id, callback, scope) {
  await jsm.streams.add({ name: id })
  const c = await js.consumers.get(id)
  const { num_pending } = await c.info()
  console.log('SUBSCRIBING!!!!!!!!!!!!!!!!!')

  const messages = await c.consume({ max_messages: 1000 })

  const history = []

  if (num_pending === 0) callback({ history, scope, state: {} })

  ;(async () => {
    for await (const m of messages) {
      if (num_pending > history.length) {
        try {
          history.push(jsonCodec.decode(m.data))
        }
        catch (error) {
          // TODO: better handling of non-JSON payloads
        }
      }

      if (num_pending > 0 && num_pending === history.length) {
        //  TODO: fill in state from history
        callback({ history, scope, state: {} })
      }
      else {
        try {
          callback({ update: jsonCodec.decode(messages.data), scope })
        }
        catch (error) {
          // TODO: better handling of non-JSON payloads
        }
      }
      //  TODO: deal with different messages
      m.ack()
    }
  })()

  return function unsubscribe() {
    //  TODO: unsubscribe logic
    //  TODO: clean up subscriptions when no more subscribers
  }
}
