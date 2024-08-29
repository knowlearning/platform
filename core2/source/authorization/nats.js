import {
  NATSClient,
  environment,
  nkeyAuthenticator,
  jetstreamManager
} from './externals.js'
  
const { NATS_AUTH_USER_NKEY_PRIVATE } = environment

const nc = await NATSClient({
  servers: "nats://nats-server:4222",
  authenticator: nkeyAuthenticator(new TextEncoder().encode(NATS_AUTH_USER_NKEY_PRIVATE))
})

console.log('GOT CLIENT....')
const jsm = await jetstreamManager(nc)

await jsm.streams.add({ name: 'updates', subjects: ['updates.>'] })

export { nc, jsm }