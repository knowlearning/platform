import {
  NATSClient,
  encodeJSON,
  decodeJSON,
  serve,
  environment,
  nkeyAuthenticator,
  nkeysFromSeed,
  decodeString,
  decodeJWT,
  encodeJWT,
  encodeAuthorizationResponse,
  encodeString
} from './externals.js'
import { upload, download } from './storage.js'
import { decodeNATSSubject } from './agent/utils.js'
//import configure from './configure.js'

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

/*
const jsm = await nc.jetstreamManager()
const js = await nc.jetstream()

;(async () => {
  await jsm.streams.add({ name: 'postgres-metadata' })
  const oc = await js.consumers.get('postgres-metadata')
  const messages = await oc.consume()
  for await (const message of messages) {
    const { subject, update } = decodeJSON(message.data)
    const [domain, owner, name] = decodeNATSSubject(subject)
    console.log('create or insert', {...update, domain, owner, name })
  }
})()

nc.subscribe("whatever", {
  callback: (err, msg) => {
    if (err) {
      console.log("subscription error", err.message)
      return
    }

    console.log('GOT WHATEVER PUBLISH...')

    const name = msg.subject.substring(6)
    msg.respond(`hello, ${name}`)
  }
})

console.log('publishing')
nc.publish("whatever", encodeJSON({ hello: 'world' }))
console.log('published...')

*/

nc.subscribe("$SYS.REQ.USER.AUTH", {
  callback: async (err, msg) => {
    if (err) {
      console.log("subscription error", err.message)
      return
    }

    const jwt = await decodeJWT(decodeString(msg.data))

    const userPrefix = `localhost:5122.me`

    const signer = nkeysFromSeed(new TextEncoder().encode(NATS_ISSUER_NKEY_PRIVATE))

    const user = jwt.nats.user_nkey
    const server = jwt.nats.server_id.id

    const response = await encodeJWT('ed25519-nkey', {
      iss: NATS_ISSUER_NKEY_PUBLIC,
      iat: Math.floor(Date.now() / 1000),
      aud: server,
      sub: user,
      name: user,
      nats: {
        version: 2,
        type: 'authorization_response',
        jwt: await encodeJWT('ed25519-nkey', {
          sub: user,
          name: user,
          aud: 'global_account',
          iss: NATS_ISSUER_NKEY_PUBLIC,
          iat: Math.floor(Date.now() / 1000),
          issuer_account: NATS_ISSUER_NKEY_PUBLIC,
          nats: {
            version: 2,
            type: 'user',
            permissions: {
              sub: {
                allow: [
                  `${userPrefix}.>`,  // Publishing to streams on this domain
                ]
              },
              pub: {
                allow: [
                  "$JS.API.INFO", // General JS Info
                  `${userPrefix}.>`,  // Publishing to streams on this domain
                  `$JS.API.STREAM.INFO.${userPrefix}.>`, // Getting info on chat_messages stream
                  `$JS.API.CONSUMER.CREATE.${userPrefix}.>`, // Creating consumers on chat_messages stream
                  `$JS.API.CONSUMER.MSG.NEXT.${userPrefix}.>`, // Creating consumers on chat_messages stream
                ]
              }
            }
          }
        }, signer)
      }
    }, signer)

    console.log('RESPONDING!', response)

    msg.respond(response)
  }
})









const subscription = nc.subscribe(">", { queue: "all-streams-queue" })

function isSession(subject) {
  return subject.split('.')[2] === 'sessions'
}

function isClaim(subject) {
  return subject.split('.')[2] === 'claims'
}

function ignoreSubject(subject) {
  return subject.startsWith('$') ||
    subject.startsWith('_') ||
    subject === 'postgres-metadata' ||
    subject.split('.').length !== 3
}

for await (const message of subscription) {
  const { subject, data } = message
  if (ignoreSubject(subject)) continue
  try {
    if (isClaim(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata } of patch) {
        if (!metadata && path.length === 1) {
          nc.publish(
            subject,
            encodeJSON([{
              op: 'add',
              path: [...path, 'challenges'],
              value: {
                dns: '',
                http: ''
              }
            }])
          )
        }
      }
    }
    else if (isSession(subject)) {
      const patch = decodeJSON(data)
      for (const { path, metadata, value } of patch) {
        if (metadata) continue
        else if (path[path.length-2] === 'uploads') {
          const { id } = value
          //  TODO: ensure id is uuid
          const { type } = value
          const { url, info } = await upload(type, id)
          nc.publish(
            id,
            encodeJSON([
              {
                metadata: true,
                op: 'add',
                path: [],
                value: {
                  domain: 'TODO: add upload domain',
                  user: 'core',
                  scope: id,
                  type
                }
              },
              {
                op: 'add',
                path: [],
                value: info
              }
            ])
          )
          message.respond(encodeJSON({ value: url }))

        }
        else if (path[path.length-2] === 'downloads') {
          message.respond(encodeJSON({
            value: await download(value.id)
          }))
        }
        else if (path[path.length-2] === 'queries') {
          message.respond(encodeJSON({
            value: 'yep!!!! TODO: do something more....'
          }))
        }
      }
    }
    else {
      const patch = decodeJSON(data)
      if (patch.length === 2 && patch[0].metadata && patch[0].value.type === 'application/json;type=domain-config') {
        const { config, report, domain } = patch[1].value
        configure(domain, config, report)
      }
    }
    const patch = decodeJSON(data)
    const metadataPatch = patch.filter(({metadata})=> metadata)
    if (metadataPatch.length) {
      const update = metadataPatch.reduce((acc, { path, value }) => {
        if (path.length) {
          acc[path[0]] = value
          return acc
        }
        else return value
      }, {})
      //  TODO: gather all updated fields for metadata
      js.publish('postgres-metadata', encodeJSON({subject, update}))
    }
    //  TODO: push metadata updates to a stream
  } catch (error) {
    console.log('error decoding JSON', error, subject, data)
  }
}


const handler = request => {
  const url = new URL(request.url);
  if (url.pathname === "/authorize") {
    console.log('GOT REQUEST!!!!!!', request)
    return new Response("Hello, World!", { status: 200 })
  } else  {
    return new Response('', { status: 200 })
  }
}

console.log('HTTP web server running. Access it at: http://localhost:8000/')
await serve(handler, { port: AUTHORIZE_PORT })