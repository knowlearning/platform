import {
  NATSClient,
  environment,
  nkeyAuthenticator,
  jetstream,
  jetstreamManager
} from './externals.js'
  
const { NATS_AUTH_USER_NKEY_PRIVATE } = environment

const nc = await NATSClient({
  servers: "nats://nats:4222",
  authenticator: nkeyAuthenticator(new TextEncoder().encode(NATS_AUTH_USER_NKEY_PRIVATE))
})

console.log('NATS CONNECTED!')
const jsm = await jetstreamManager(nc)
const js = await jetstream(nc)

await jsm.streams.add({ name: 'updates', subjects: ['updates.>'] })

export { nc, jsm, js }