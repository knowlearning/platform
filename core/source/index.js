import { environment, requestDomain } from './utils.js'
import handleHttpRequest from './handle-http-request.js'
import { ensureDomainConfigured } from './side-effects/configure.js'

const {
  MODE,
  PORT,
  INSECURE_DEVELOPMENT_CERT,
  INSECURE_DEVELOPMENT_KEY,
  SECRET_ENCRYPTION_KEY,
  TLS_PORT,
  ADMIN_DOMAIN
} = environment

const HTTP_SERVE_CONFIG = { port: PORT }

const LOCAL_SERVE_CONFIG = {
  port: TLS_PORT,
  cert: INSECURE_DEVELOPMENT_CERT,
  key: INSECURE_DEVELOPMENT_KEY,
}

const initialConfig = Promise.all([
  ensureDomainConfigured(ADMIN_DOMAIN),
  ensureDomainConfigured('core')
])

function handler(request) {
  ensureDomainConfigured(requestDomain(request))
  return handleHttpRequest(request)
}

//  Serve https directly from local
if (MODE === 'local') Deno.serve(LOCAL_SERVE_CONFIG, handler)

Deno.serve(HTTP_SERVE_CONFIG, handler)
