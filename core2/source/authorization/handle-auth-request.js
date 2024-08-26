import {
  decodeString,
  nkeysFromSeed,
  decodeJWT,
  encodeJWT,
  environment
} from './externals.js'

const {
  NATS_ISSUER_NKEY_PUBLIC,
  NATS_ISSUER_NKEY_PRIVATE
} = environment

export default async function(err, msg) {
  if (err) {
    console.log("subscription error", err.message)
    return
  }

  const jwt = await decodeJWT(decodeString(msg.data))

  const signer = nkeysFromSeed(new TextEncoder().encode(NATS_ISSUER_NKEY_PRIVATE))

  const user = jwt.nats.user_nkey
  const server = jwt.nats.server_id.id
  const token = jwt.nats.client_info.user

  const isCore = token.startsWith('deno-')
  //  TODO: core should have ability to write into user scopes?
  //        Establishing that concept is okay, since we're pretty
  //        sure we'll need it for migrations and such anyway...
  const userPrefix = isCore || true ? `>` : `localhost:5122.${token}.>`

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
        name: 'me',
        jti: 'ZYJV3UUUNG22E5RNP6DEY5F6LUEQEPMP57ZX2ONRTM2ASIWNFRLQ', // TODO: Necessary?
        aud: 'global_account',
        iss: NATS_ISSUER_NKEY_PUBLIC,
        iat: Math.floor(Date.now() / 1000),
        nats: {
          version: 2,
          type: 'user',
          sub: {
            allow: [
              userPrefix,  // Publishing to streams on this domain
              `_INBOX.>` // TODO: restrict to only the reply inbox necessary
            ]
          },
          pub: {
            allow: [
              userPrefix,  // Publishing to subjects for this user on this domain
              "$JS.API.INFO", // General JS Info
              //  TODO: the below should probably be added iteratively as ownership is established
              `$JS.API.STREAM.INFO.>`,
              `$JS.API.STREAM.NAMES`,
              `$JS.API.STREAM.CREATE.>`,
              `$JS.API.CONSUMER.CREATE.>`,
              `$JS.API.CONSUMER.MSG.NEXT.>`,
            ]
          },
          resp: {
            max: 1
          },
          subs: -1,
          data: -1,
          payload: -1
        }
      }, signer)
    }
  }, signer)
  console.log('RESPONDING!', response)

  msg.respond(response)
}