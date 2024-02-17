import { environment, randomBytes, getCookies, setCookie } from './utils.js'
import * as redis from './redis.js'
import { decrypt } from './utils.js'
import handleConnection from './handle-connection.js'
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

const LOCAL_SERVE_CONFIG = {
  port: TLS_PORT,
  cert: INSECURE_DEVELOPMENT_CERT,
  key: INSECURE_DEVELOPMENT_KEY,
}

const initialConfig = Promise.all([
  ensureDomainConfigured(ADMIN_DOMAIN),
  ensureDomainConfigured('core')
])

const serveConfig = MODE === 'local' ? LOCAL_SERVE_CONFIG : { port: PORT }

Deno.serve(serveConfig, request => {
  if (request.headers.get("upgrade") != "websocket") {
    return new Response(null, { status: 501 })
  }

  let sid = getCookies(request.headers)['sid']

  const headers = new Headers()

  if (!sid) {
    sid = randomBytes(16, 'hex')
    setCookie(headers, { name: 'sid', value: sid, secure: true, httpOnly: true })
  }

  const { socket, response } = Deno.upgradeWebSocket(request, { idleTimeout: 10, headers })

  //  TODO: domain should probably be "development", "staging" or "production" based on mode...
  const { host: domain } = new URL(request.headers.get('origin') || 'https://core')

  const connection = {
    send(message) { socket.send(JSON.stringify(message)) },
    close() { socket.close() }
  }

  ensureDomainConfigured(domain)

  socket.addEventListener('message', ({ data }) => {
    try {
      connection.onmessage(JSON.parse(data))
    }
    catch (error) {
      console.warn('ERROR PARSING MESSAGE', error)
      socket.send(JSON.stringify({ error: 'Error Parsing Message' }))
    }
  })

  handleConnection(connection, domain, sid)

  return response
})
