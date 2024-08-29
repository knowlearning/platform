import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import { connect as NATSClient } from "jsr:@nats-io/transport-deno@3.0.0-7"
import { jetstream, jetstreamManager } from "jsr:@nats-io/jetstream@3.0.0-9"
import { nkeyAuthenticator } from "https://deno.land/x/nats@v1.28.2/nats-base-client/authenticator.ts";
import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import * as pg from "https://deno.land/x/postgres@v0.17.1/mod.ts"
import nodePostres from 'npm:pg@8.11.0'
import { serve } from "https://deno.land/std@0.202.0/http/server.ts"
import { fromSeed as nkeysFromSeed, decode as decodeJWT, encode as encodeJWT, encodeAuthorizationResponse } from 'npm:nats-jwt@0.0.9'

/* for agent dependencies */
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect, JSONCodec, StringCodec } from 'npm:nats.ws@1.29.0'

const escapePostgresLiteral = nodePostres.escapeLiteral

const {
  encode: encodeJSON,
  decode: decodeJSON
} = JSONCodec()

const {
  encode: encodeString,
  decode: decodeString
} = StringCodec()

const randomBytes = (size, encoding) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  if (encoding === 'hex') return encodeToString(bytes)
  else return bytes
}

const environment = Deno.env.toObject()

export {
  pg,
  serve,
  escapePostgresLiteral,
  nkeyAuthenticator,
  environment,
  randomBytes,
  parseYAML,
  NATSClient,
  jetstream, jetstreamManager,
  encodeJSON,
  decodeJSON,
  encodeString,
  decodeString,
  decodeJWT,
  encodeJWT,
  encodeAuthorizationResponse,
  nkeysFromSeed,
  GCSStorageClient
}

const charToEnc = { '%'  : '%25', '\u0000': '%00'   , '*'  : '%2A', '>'  : '%3E', '.'  : '%2E', ' '  : '%20' }
const encToChar = { '%25':   '%', '%00'   : '\u0000', '%2A': '*'  , '%3E': '>'  , '%2E': '.'  , '%20': ' '   }

export function encodeNATSToken(str) {
  return str.split('').map(c => charToEnc[c] || c).join('')
}

export function decodeNATSToken(str) {
  return str.split('').map(c => encToChar[c] || c).join('')
}

export function encodeNATSSubject(domain, user, scope) {
  return ['patch', domain, user, scope].map(encodeNATSToken).join('.')
}

export function decodeNATSSubject(subject) {
  return subject.split('.').slice(1).map(decodeNATSToken)
}