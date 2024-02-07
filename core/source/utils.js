import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import { createCipheriv, createDecipheriv } from "https://deno.land/std@0.173.0/node/crypto.ts";
import { connect as createRedisClient } from 'https://deno.land/x/redis/mod.ts'
import * as pg from 'https://deno.land/x/pg@v0.6.1/mod.ts'
import jwkToPem from 'npm:jwk-to-pem'
import jwt from 'npm:jsonwebtoken'
import nacl from 'npm:tweetnacl'
import { Storage as createGCSClient } from 'npm:@google-cloud/storage'
import { exists as fileExists } from "https://deno.land/std/fs/mod.ts"
import { getCookies, setCookie } from 'https://deno.land/std@0.214.0/http/cookie.ts'


const { box } = nacl
const uuid = crypto.randomUUID
const randomBytes = crypto.randomBytes
const environment = Deno.env.toObject()
const writeFile = Deno.writeFile
const cryptoDigest = (algorithm, data) => crypto.subtle.digest(algorithm, data)

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
  writeFile,
  getCookies,
  setCookie,
  environment
}
