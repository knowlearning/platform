import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import { v5 as uuidv5 } from 'npm:uuid@11.1.0'
import { createClient as createRedisClient } from 'npm:redis@4.7.0'
import * as pg from 'https://deno.land/x/postgres@v0.19.3/mod.ts'
import Agent from 'npm:@knowlearning/agents@0.9.172/agents/generic/index.js'
import { applyPatch } from 'npm:fast-json-patch@3.1.1/index.mjs'
import nodePostres from 'npm:pg@8.11.0'
import jwkToPem from 'npm:jwk-to-pem@2.0.5'
import jwt from 'npm:jsonwebtoken@8.5.1'
import nacl from 'npm:tweetnacl@1.0.3'
import PatchProxy from 'npm:@knowlearning/patch-proxy@1.3.2'
import { Storage as createGCSClient } from 'npm:@google-cloud/storage@5.18.2'
import { getCookies } from 'https://deno.land/std@0.214.0/http/cookie.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import { Server as SocketIOServer } from "https://deno.land/x/socket_io@0.2.1/mod.ts"
import { encodeBase64, decodeBase64 } from "jsr:@std/encoding@1.0.10"
import jexl from 'npm:jexl@2.3.0'
import { create, getNumericDate } from "https://deno.land/x/djwt@v3.0.1/mod.ts"

const DJWT = {
  create,
  getNumericDate
}

const environment = Deno.env.toObject()

const evalFilter = (expression, variables) => jexl.eval(expression, variables)

const { box } = nacl
const uuid = () => crypto.randomUUID()
const randomBytes = (size, encoding) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  if (encoding === 'hex') return encodeToString(bytes)
  else return bytes
}
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

async function encryptString(theirPublicKey, plainText) {
  const { publicKey, secretKey } =  await generateKeyPair()

  const encrypted = encrypt(
    secretKey,
    decodeBase64(theirPublicKey),
    new TextEncoder().encode(plainText)
  )
  const combined = new Uint8Array(publicKey.length + encrypted.length)

  combined.set(publicKey)
  combined.set(encrypted, publicKey.length)

  return encodeBase64(combined)
}

function decryptString(secretKey, encryptedText) {
  const data = decodeBase64(encryptedText)
  const publicKey = data.slice(0, 32)
  const ciphertext = data.slice(32)

  return new TextDecoder().decode(
    decrypt(
      decodeBase64(secretKey),
      publicKey,
      ciphertext
    )
  )
}


export {
  pg,
  jwt,
  jwkToPem,
  isUUID,
  parseYAML,
  uuid,
  uuidv5,
  box,
  randomBytes,
  decodeBase64String,
  decryptBase64String,
  decodeBase64,
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
  PatchProxy,
  Agent,
  applyPatch,
  evalFilter,
  SocketIOServer,
  encryptString,
  decryptString,
  DJWT
}
