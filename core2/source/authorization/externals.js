import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import {
  connect as NATSClient,
  JSONCodec,
  StringCodec
} from 'https://deno.land/x/nats@v1.28.2/src/mod.ts'
import { nkeyAuthenticator } from "https://deno.land/x/nats@v1.28.2/nats-base-client/authenticator.ts";

import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'
import { encodeToString } from 'https://deno.land/std@0.90.0/encoding/hex.ts'
import * as pg from "https://deno.land/x/postgres@v0.17.1/mod.ts";
import nodePostres from 'npm:pg@8.11.0'
import { serve } from "https://deno.land/std@0.202.0/http/server.ts";

/* for agent dependencies */
import { validate as isUUID } from 'https://deno.land/std@0.207.0/uuid/mod.ts'
import PatchProxy, { standardJSONPatch } from 'npm:@knowlearning/patch-proxy@1.3.2'
import fastJSONPatch from 'npm:fast-json-patch@3.1.1'
import { connect, JSONCodec as jc } from 'npm:nats.ws@1.29.0'

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
  encodeJSON,
  decodeJSON,
  encodeString,
  decodeString,
  GCSStorageClient
}