import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import { connect as NATSClient, JSONCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'
import { parse as parseYAML } from 'https://deno.land/std@0.207.0/yaml/mod.ts'

const {
  encode: encodeJSON,
  decode: decodeJSON
} = JSONCodec()

export {
  parseYAML,
  NATSClient,
  encodeJSON,
  decodeJSON,
  GCSStorageClient
}