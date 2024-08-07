import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import { connect as NATSClient, JSONCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'
import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import * as pg from "https://deno.land/x/postgres@v0.17.1/mod.ts";
import nodePostres from 'npm:pg@8.11.0'

const escapePostgresLiteral = nodePostres.escapeLiteral

const {
  encode: encodeJSON,
  decode: decodeJSON
} = JSONCodec()

const randomBytes = (size, encoding) => {
  const bytes = crypto.getRandomValues(new Uint8Array(size))
  if (encoding === 'hex') return encodeToString(bytes)
  else return bytes
}

const environment = Deno.env.toObject()

export {
  pg,
  escapePostgresLiteral,
  environment,
  randomBytes,
  parseYAML,
  NATSClient,
  encodeJSON,
  decodeJSON,
  GCSStorageClient
}