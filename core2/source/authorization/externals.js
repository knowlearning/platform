import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import { connect as NATSClient } from "jsr:@nats-io/transport-deno@3.0.0-7"
import { jetstream, jetstreamManager } from "jsr:@nats-io/jetstream@3.0.0-15"
import { nkeyAuthenticator } from "https://deno.land/x/nats@v1.28.2/nats-base-client/authenticator.ts";
import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import * as pg from "https://deno.land/x/postgres@v0.17.1/mod.ts"
import nodePostres from 'npm:pg@8.11.0'
import { serve } from "https://deno.land/std@0.202.0/http/server.ts"
import { fromSeed as nkeysFromSeed, decode as decodeJWT, encode as encodeJWT, encodeAuthorizationResponse } from 'npm:nats-jwt@0.0.9'
import { createClient as createRedisClient } from 'npm:redis@4.2.0'
import { decodeBase64 } from "https://deno.land/std/encoding/base64.ts"
import jwkToPem from 'npm:jwk-to-pem@2.0.5'
import jwt from 'npm:jsonwebtoken@8.5.1'
import { getCookies } from 'https://deno.land/std@0.214.0/http/cookie.ts'

/* for agent dependencies */
import { validate as isUUID, v4 as uuid } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { JSONCodec, StringCodec } from 'npm:@nats-io/nats-core@3.0.0-27'

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

const applyPatch = fastJSONPatch.applyPatch

const decodeBase64String = string => (new TextDecoder()).decode(decodeBase64(string))

// Utility function to convert PEM to ArrayBuffer
function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '');
  const binary = atob(b64);
  const array = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i);
  }
  return array.buffer;
}

async function decryptBase64String(privateKeyPem, encryptedBase64) {
  // Import the RSA private key
  const privateKey = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(privateKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['decrypt']
  )

  const [encodedIv, encodedEncryptedData, encodedEncryptedSymmetricKey] = encryptedBase64.split(',').map(decodeURIComponent)
  const iv = Uint8Array.from(atob(encodedIv), c => c.charCodeAt(0))
  const encryptedData = Uint8Array.from(atob(encodedEncryptedData), c => c.charCodeAt(0))
  const encryptedSymmetricKey = Uint8Array.from(atob(encodedEncryptedSymmetricKey), c => c.charCodeAt(0))

  const symmetricKeyArrayBuffer = await crypto.subtle.decrypt(
    { name: 'RSA-OAEP' },
    privateKey,
    encryptedSymmetricKey
  )

  const symmetricKey = await crypto.subtle.importKey(
    'raw',
    symmetricKeyArrayBuffer,
    { name: 'AES-GCM' },
    true,
    ['decrypt']
  )

  const decryptedData = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    encryptedData
  )

  return new TextDecoder().decode(decryptedData)
}


async function getKey(password) {
  const encoder = new TextEncoder()
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    encoder.encode(password),
    { name: "PBKDF2" },
    false,
    ["deriveBits", "deriveKey"]
  )

  return crypto.subtle.deriveKey(
    { name: "PBKDF2", salt: new Uint8Array(16), iterations: 100000, hash: "SHA-256" },
    keyMaterial,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  )
}

async function encryptSymmetric(secret, data) {
  const key = await getKey(secret)

  const encoder = new TextEncoder()
  const encodedData = encoder.encode(data)

  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedData = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encodedData
  )

  const result = new Uint8Array(iv.length + new Uint8Array(encryptedData).length)
  result.set(iv)
  result.set(new Uint8Array(encryptedData), iv.length)

  return btoa(String.fromCharCode.apply(null, result))
}

async function decryptSymmetric(secret, encryptedData) {
  const key = await getKey(secret)

  const decodedData = atob(encryptedData)
  const iv = new Uint8Array(decodedData.slice(0, 12).split('').map(c => c.charCodeAt(0)))
  const encryptedBytes = new Uint8Array(decodedData.slice(12).split('').map(c => c.charCodeAt(0)))

  const decryptedData = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv },
    key,
    encryptedBytes
  )

  const decoder = new TextDecoder()
  return decoder.decode(new Uint8Array(decryptedData))
}

const cryptoDigest = (algorithm, data) => crypto.subtle.digest(algorithm, data)

export {
  pg,
  serve,
  escapePostgresLiteral,
  nkeyAuthenticator,
  environment,
  jwkToPem,
  jwt,
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
  uuid,
  GCSStorageClient,
  standardJSONPatch,
  createRedisClient,
  applyPatch,
  randomBytes,
  cryptoDigest,
  encryptSymmetric,
  decryptSymmetric,
  decodeBase64String,
  decryptBase64String,
  getCookies,
  isUUID
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