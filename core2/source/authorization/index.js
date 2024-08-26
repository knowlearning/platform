import {
  NATSClient,
  environment,
  nkeyAuthenticator,
  jetstreamManager
} from './externals.js'
import handleSideEffects from './handle-side-effects.js'
import handleAuthRequest from './handle-auth-request.js'

const { NATS_AUTH_USER_NKEY_PRIVATE } = environment

const nc = await NATSClient({
  servers: "nats://nats-server:4222",
  authenticator: nkeyAuthenticator(new TextEncoder().encode(NATS_AUTH_USER_NKEY_PRIVATE))
})

console.log('GOT CLIENT....')
const jsm = await jetstreamManager(nc)

await jsm.streams.add({ name: 'postgres-sync', subjects: ['postgres-sync'] })

nc.subscribe("$SYS.REQ.USER.AUTH", { callback: handleAuthRequest })
nc.subscribe(">", { queue: "all-streams-queue", callback: handleSideEffects })
