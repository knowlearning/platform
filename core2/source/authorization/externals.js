import { Storage as GCSStorageClient } from 'npm:@google-cloud/storage@5.18.2'
import { connect as NATSClient, JSONCodec } from 'https://deno.land/x/nats@v1.28.1/src/mod.ts'

export {
  NATSClient,
  JSONCodec,
  GCSStorageClient
}