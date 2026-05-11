// Prep all other "Persistence backend" marked files so the only edits we'll need for multi-redis instance support can be made in this file

import { createRedisClient, environment } from './utils.js'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_PASSWORD
} = environment

const clientConnectionInfo = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_PASSWORD
}

const client = createRedisClient(clientConnectionInfo)
const subscriptions = createRedisClient(clientConnectionInfo)

client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([
  client.connect(),
  subscriptions.connect()
]).then(() => console.log('CONNECTED!'))

export { client, subscriptions, connected }