import { environment, randomBytes, getCookies, setCookie } from './utils.js'
import * as redis from './redis.js'
import { decrypt } from './encryption.js'
import handleWS from './handle-ws.js'
import { applyConfiguration, ensureDomainConfigured } from './side-effects/configure.js'
import ADMIN_DOMAIN_CONFIG from './admin-domain-config.js'

const {
  MODE,
  PORT,
  INSECURE_DEVELOPMENT_CERT,
  INSECURE_DEVELOPMENT_KEY,
  SECRET_ENCRYPTION_KEY,
  TLS_PORT,
  ADMIN_DOMAIN
} = environment

const initialConfig = Promise.all([
  ensureDomainConfigured(ADMIN_DOMAIN),
  ensureDomainConfigured('core')
])

function generateSid() {
  return randomBytes(16).toString('hex')
}

Deno.serve({
  port: TLS_PORT,
  cert: INSECURE_DEVELOPMENT_CERT,
  key: INSECURE_DEVELOPMENT_KEY,
}, request => {
  if (request.method === 'HEADERS') {
    const responseHeaders = new Headers()
    if (!getCookies(request.headers)['sid']) {
      setCookie(responseHeaders, { name: 'sid', value: generateSid(), secure: true, httpOnly: true })
    }
    return new Response('', { headers: responseHeaders })
  }
  else if (request.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 });
  }

  const { socket, response } = Deno.upgradeWebSocket(request);
  
  handleWS(socket, request)

  return response
})

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
  wsServer.on('connection', async (ws, upgradeReq) => {
    await initialConfig
    handleWS(ws, upgradeReq)
  })
  server.listen(port)
}
