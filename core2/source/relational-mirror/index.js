import {
  NATSClient,
  environment,
  nkeyAuthenticator,
  decodeString,
  jetstream, jetstreamManager
} from './externals.js'
import * as postgres from './postgres.js'
import postgresDefaultTables from './postgres-default-tables.js'
import Agent from './agent/deno/deno.js'

const {
  AUTHORIZE_PORT,
  NATS_AUTH_USER_NKEY_PUBLIC,
  NATS_AUTH_USER_NKEY_PRIVATE,
  NATS_ISSUER_NKEY_PUBLIC,
  NATS_ISSUER_NKEY_PRIVATE
} = environment

const nc = await NATSClient({
  servers: "nats://nats-server:4222",
  authenticator: nkeyAuthenticator(new TextEncoder().encode(NATS_AUTH_USER_NKEY_PRIVATE))
})

console.log('GOT CLIENT....')
const jsm = await jetstreamManager(nc)
const js = await jetstream(nc)

const oc = await js.consumers.get('postgres-sync')
const messages = await oc.consume()

for await (const message of messages) {
  try {
    message.ack()
    const id = decodeString(message.data)
    //const metadata = await Agent.metadata(id)
    console.log('GETTING STATE!!!!!!!!!!!!!!!!!!!!', id)
    Agent
      .state(id)
      .then(state => {
        console.log('GOT STATE!!!!!!!!!!!!!!!!!!!!', state)
      })
      .catch('ISSUE GETTING STATE!', id)
    /*
    const { columns } = postgresDefaultTables.metadata
    //  TODO: ensure at least metadata table is configured for domain
    const [query, params] = postgres.setRow(metadata.domain, 'metadata', columns, id, metadata)
    await postgres.query(metadata.domain, query, params)
    // TODO: push update to any other configured tables
    */
  }
  catch (error) {
    message.ack()
    console.log('ERRROR SETTING METADATA!', error)
  }
}
