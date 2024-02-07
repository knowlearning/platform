import jwkToPem from 'jwk-to-pem'
import jwt from 'jsonwebtoken'
import { parse as parseYAML } from 'yaml'
import { validate as isUUID, v4 as uuid } from 'uuid'
import nacl from 'tweetnacl'
import pg from 'pg'
import { Storage as createGCSClient } from '@google-cloud/storage'
import { createClient as createRedisClient } from 'redis'
import crypto from 'crypto'

const { box } = nacl
const randomBytes = crypto.randomBytes
const environment = process.env
const cryptoDigest = (algorithm, data) => crypto.subtle.digest(algorithm, data)
const { createCipheriv, createDecipheriv } = crypto

export {
  pg,
  jwt,
  jwkToPem,
  isUUID,
  parseYAML,
  uuid,
  box,
  randomBytes,
  createRedisClient,
  createGCSClient,
  cryptoDigest,
  createCipheriv,
  createDecipheriv,
  environment
}

/* Deno
import jwkToPem from 'npm:jwk-to-pem'
import jwt from 'npm:jsonwebtoken'
import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import nacl from 'npm:tweetnacl'
import * as pg from "https://deno.land/x/pg@v0.6.1/mod.ts";
import { Storage as createGCSClient } from 'npm:@google-cloud/storage'
import { createClient as createRedisClient } from 'redis'

const { box } = nacl
const randomBytes = crypto.randomBytes
const uuid = crypto.randomUUID
const environment = Deno.env.get()
const cryptoDigest = crypto.subtle.digest

export {
  pg,
  jwt,
  jwkToPem,
  isUUID,
  parseYAML,
  uuid,
  box,
  randomBytes,
  createRedisClient,
  createGCSClient,
  cryptoDigest,
  environment
}
*/