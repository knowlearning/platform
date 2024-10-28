import { createRedisClient, environment } from "./externals.js"

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_SERVICE_ACCOUNT_CREDENTIALS
} = environment

const clientConnectionInfo = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_SERVICE_ACCOUNT_CREDENTIALS
}

const client = createRedisClient(clientConnectionInfo)

client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

await client.connect()

console.log('REDIS CONNECTED!')

export { client }
