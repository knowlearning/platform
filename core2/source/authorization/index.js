import { connect, StringCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'

const nc = await connect({ servers: "nats://nats-server:4222" })

const sc = StringCodec()
const sub = nc.subscribe(">", { queue: "all-streams-queue" })

console.log('Subscribing...')
for await (const m of sub) {
  console.log(`[${sub.getProcessed()}]: ${sc.decode(m.data)}`)
}

console.log('done...')

while (true) {
  await new Promise(r => setTimeout(r, 1000))
  console.log('tick')
}
