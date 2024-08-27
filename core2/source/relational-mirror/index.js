import {
  NATSClient,
  environment,
  nkeyAuthenticator,
  decodeString,
  decodeNATSSubject,
  jetstream,
  jetstreamManager
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

const oc = await js.consumers.get('updates')
const messages = await oc.consume()

for await (const message of messages) {
  try {
    message.ack() // TODO: better guarantees that still have good throughput...
    const subject = message.subject.slice(message.subject.indexOf('.') + 1)
    const  id = await jsm.streams.find(subject)

    const [domain, user, name] = decodeNATSSubject(subject)

    Agent
      .metadata(id)
      .then(async metadata => {
        const { columns } = postgresDefaultTables.metadata
        const [statement, args] = postgres.setRow(domain, 'metadata', columns, id, {...metadata, domain, user, name, id})

        await
          postgres
            .query(domain, statement, args)
            .catch(async error => {
              if (error.fields.code === '42P01') { // table not set up
                //  TODO: share code with authorization server configure script...
                const { columns, indices } = postgresDefaultTables.metadata
                await postgres.createTable(domain, 'metadata', columns)
                await Promise.all(
                  Object
                    .entries(indices)
                    .map(([name, { column }]) => {
                      return postgres.createIndex(domain, name, 'metadata', column)
                    })
                )
                return postgres.query(domain, statement, args)
              }
              else throw error
            })
        })
      console.log('PROCESSED!', id)
  }
  catch (error) {
    message.ack()
    console.log('ERRROR SETTING METADATA!', error)
  }
}
