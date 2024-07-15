import { nats } from './utils.js'

const client = await nats.connect({ server: '0.0.0.0:4222' })

const jsm = await client.jetstreamManager()


async function poll() {
  const streams = await jsm.streams.list().next()
  streams.forEach(({ config, state }) => {
    if (state.messages > 1) {
      console.log('Num Updates', config.name, state.messages)
    }
  })
  setTimeout(poll, 5000)
}

poll()