import { createServer as createServerHTTP } from 'http'
import { createServer as createServerHTTPS } from 'https'
import crypto from 'crypto'
import { WebSocketServer } from 'ws'
import * as redis from './redis.js'
import { decrypt } from './encryption.js'
import handleWS from './handle-ws.js'
import handleHTTP from './handle-http.js'
import { applyConfiguration } from './side-effects/config.js'
import ADMIN_DOMAIN_CONFIG from './admin-domain-config.js'

const {
  PORT,
  INSECURE_DEVELOPMENT_CERT,
  INSECURE_DEVELOPMENT_KEY,
  SECRET_ENCRYPTION_KEY,
  TLS_PORT,
  ADMIN_DOMAIN
} = process.env

const credentials = {
  cert: INSECURE_DEVELOPMENT_CERT,
  key: INSECURE_DEVELOPMENT_KEY
}

// TODO: consider what to do with a real persistent report
const report = {tasks:{}}
await applyConfiguration(ADMIN_DOMAIN, ADMIN_DOMAIN_CONFIG, report)

const httpServer = createServerHTTP(handleHTTP)
const httpsServer = createServerHTTPS(credentials, handleHTTP)

setUpServer(httpServer, PORT)
setUpServer(httpsServer, TLS_PORT)

// TODO: use scope watching of core2 scopes for this instead of piggy-backing off of core creds
await redis.connected

const certs = await redis.client.json.get('internal/certs/tls-certs/state')

if (certs) {
  Object
    .entries(certs)
    .forEach(([host, certInfo]) => {
      console.log('SETTING UP HTTPS HOST', host)
      setUpHTTPSContext(httpsServer, host, certInfo)
    })
}

function parseCookies(s) {
  return Object.fromEntries(s.split(';').map(p => p.split('=')))
}

function setUpServer(server, port) {
  const wsServer = new WebSocketServer({ server })
  wsServer.on('headers', (headers, request) => {
    const cookieIndex = request.rawHeaders.indexOf('Cookie') + 1
    let sid
    if (cookieIndex > 0) {
      const cookies = parseCookies(request.rawHeaders[cookieIndex])
      sid = cookies['sid']
    }
    if (!sid) {
      sid =  crypto.randomBytes(16).toString('hex')
      headers.push(`Set-Cookie: sid=${sid}; SameSite=None; Secure; HttpOnly`)
      console.log('creating sid', sid)
    }
  })
  wsServer.on('connection', handleWS)
  server.listen(port)
}

function setUpHTTPSContext(server, host, { cert, key, publicKey}) {
  try {
    const mySecretKey = Buffer.from(SECRET_ENCRYPTION_KEY, 'base64')
    const theirPublicKey = Buffer.from(publicKey, 'base64')
    const encryptedMessageBuffer = Buffer.from(key, 'base64')
    console.log('SECRET KEY LENGTH!!!!!!!!!!!!!', mySecretKey.length, SECRET_ENCRYPTION_KEY.length)
    const decryptedKey = decrypt(mySecretKey, theirPublicKey, encryptedMessageBuffer)

    server.addContext(host, { cert, key: decryptedKey })
  }
  catch (error) {
    console.log('ERROR INITIALIZING TLS HOST', error)
  }
}