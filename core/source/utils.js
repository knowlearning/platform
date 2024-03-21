import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import { createClient as createRedisClient } from 'npm:redis@4.2.0'
import * as pg from "https://deno.land/x/postgres@v0.17.1/mod.ts";
import nodePostres from 'npm:pg@8.11.0'
import jwkToPem from 'npm:jwk-to-pem@2.0.5'
import jwt from 'npm:jsonwebtoken@8.5.1'
import nacl from 'npm:tweetnacl@1.0.3'
import PatchProxy from 'npm:@knowlearning/patch-proxy@1.0.1'
import { Storage as createGCSClient } from 'npm:@google-cloud/storage@5.18.2'
import { exists as fileExists } from "https://deno.land/std/fs/mod.ts"
import { getCookies } from 'https://deno.land/std@0.214.0/http/cookie.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import { decodeBase64 } from "https://deno.land/std/encoding/base64.ts"

const { box } = nacl
const uuid = () => crypto.randomUUID()
const randomBytes = (size, encoding) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  if (encoding === 'hex') return encodeToString(bytes)
  else return bytes
}
const environment = Deno.env.toObject()
const writeFile = (filename, data) => Deno.writeFile(filename, (new TextEncoder()).encode(data))
const cryptoDigest = (algorithm, data) => crypto.subtle.digest(algorithm, data)

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

const IV_LENGTH = 16

const encrypt = (mySecretKey, theirPublicKey, messageBuffer) => {
  const nonce = randomBytes(box.nonceLength)
  const encrypted = box(messageBuffer, nonce, theirPublicKey, mySecretKey)

  const fullMessage = new Uint8Array(nonce.length + encrypted.length)
  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)

  return fullMessage
}

const decrypt = (mySecretKey, theirPublicKey, encryptedMessageBufferWithNonce) => {
  const nonce = encryptedMessageBufferWithNonce.slice(0, box.nonceLength)
  const encryptedMessageBuffer = encryptedMessageBufferWithNonce.slice(box.nonceLength, encryptedMessageBufferWithNonce.length)
  const decrypted = box.open(encryptedMessageBuffer, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  return decrypted
}

const decodeBase64String = string => (new TextDecoder()).decode(decodeBase64(string))
const escapePostgresLiteral = nodePostres.escapeLiteral
const requestDomain = request => (new URL(request.headers.get('origin') || 'https://core')).host

export {
  pg,
  jwt,
  jwkToPem,
  isUUID,
  parseYAML,
  uuid,
  box,
  randomBytes,
  decodeBase64String,
  createRedisClient,
  createGCSClient,
  cryptoDigest,
  encrypt,
  decrypt,
  encryptSymmetric,
  decryptSymmetric,
  writeFile,
  getCookies,
  requestDomain,
  escapePostgresLiteral,
  environment,
  PatchProxy
}
