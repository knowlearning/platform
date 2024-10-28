import Agent from './agent/deno/deno.js'
import {
  decodeString,
  nkeysFromSeed,
  decodeJWT,
  encodeJWT,
  encodeNATSToken,
  createHash,
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
  const token = jwt.nats.connect_opts.auth_token


  const isCore = token.startsWith('deno-') || token === 'core'

  const session = await new Promise(async resolve => {
    if (isCore) return resolve({})

    const unwatch = (
      Agent
        .watch(`user-nats-${await createHash(token)}`, ({ state }) => {
          //  TODO: Specify timeout
          if (state.user && state.domain) {
            resolve(state)
            unwatch()
          }
        })
    )
  })

  console.log("GOT TOKEN????", jwt.nats)

  //  TODO: core should have ability to write into user scopes?
  //        Establishing that concept is okay, since we're pretty
  //        sure we'll need it for migrations and such anyway...
  const userPrefix = isCore ? `>` : `${encodeNATSToken(session.domain)}.${encodeNATSToken(session.user)}`
  const coreUserId = isCore ? 'core' : session.user

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
        name: coreUserId,
        jti: 'ZYJV3UUUNG22E5RNP6DEY5F6LUEQEPMP57ZX2ONRTM2ASIWNFRLQ', // TODO: Necessary?
        aud: 'global_account',
        iss: NATS_ISSUER_NKEY_PUBLIC,
        iat: Math.floor(Date.now() / 1000),
        nats: {
          version: 2,
          type: 'user',
          sub: {
            allow: [
              isCore ? '>' : `responses.patch.${userPrefix}.>`,  // Publishing to streams on this domain
              `_INBOX.>` // TODO: restrict to only the reply inbox necessary
            ]
          },
          pub: {
            allow: [
              'resolve',
              isCore ? '>' : `patch.${userPrefix}.>`,  // Publishing to subjects for this user on this domain
              `$JS.API.STREAM.INFO.>`,
              // TODO: REMOVE FOR CLIENTS EXCEPT FOR CORE (needed to do jsm.streams.find)
              `$JS.API.INFO`,
              `$JS.API.CONSUMER.CREATE.>`,
              `$JS.API.CONSUMER.MSG.NEXT.>`
              // `$JS.API.STREAM.NAMES`,
              // `$JS.API.STREAM.CREATE.>`,
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

  msg.respond(response)
}