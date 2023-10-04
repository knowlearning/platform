import { createClient } from 'redis'

const {
  REDIS_HOST,
  REDIS_PORT,
  REDIS_SERVICE_ACCOUNT_CREDENTIALS
} = process.env

const clientConnectionInfo = {
  socket: {
    host: REDIS_HOST,
    port: REDIS_PORT
  },
  password: REDIS_SERVICE_ACCOUNT_CREDENTIALS
}

const client = createClient(clientConnectionInfo)
const subscriptions = createClient(clientConnectionInfo)

client.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))
subscriptions.on('error', e => console.warn('ERROR CONNECTING TO REDIS', e.toString()))

const connected = Promise.all([
  client.connect(),
  subscriptions.connect()
]).then(() => console.log('CONNECTED!'))

export { client, subscriptions, connected }