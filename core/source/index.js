import { environment, randomBytes, getCookies, setCookie } from './utils.js'
import * as redis from './redis.js'
import { decrypt } from './utils.js'
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
    return new Response(null, { status: 501 })
  }

  const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 10 })
  
  handleWS(socket, request)

  return response
})
