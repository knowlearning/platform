import { connect, JSONCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'

const nc = await connect({ servers: "nats://nats-server:4222" })

const { decode: decodeJSON } = JSONCodec()
const sub = nc.subscribe(">", { queue: "all-streams-queue" })

for await (const m of sub) {
  try {
     console.log(decodeJSON(m.data))
   } catch (error) {
     console.log('error decoding JSON', m.data)
   }
}
