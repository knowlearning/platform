import { environment, requestDomain } from './utils.js'
import handleHttpRequest from './handle-http-request.js'
import { ensureDomainConfigured } from './side-effects/configure.js'
import './nats-test.js'

const {
  MODE,
  PORT,
  INSECURE_DEVELOPMENT_CERT: cert,
  INSECURE_DEVELOPMENT_KEY: key,
  TLS_PORT,
  ADMIN_DOMAIN
} = environment

ensureDomainConfigured(ADMIN_DOMAIN)
ensureDomainConfigured('core')

//  Serve https directly when in local development mode
if (MODE === 'local') {
  Deno.serve({ port: TLS_PORT, cert, key }, handler)
}

Deno.serve({ port: PORT }, handler)

function handler(request) {
  ensureDomainConfigured(requestDomain(request))
  return handleHttpRequest(request)
}

globalThis.addEventListener("unhandledrejection", event => {
  console.log("UNHANDLED REJECTION HANDLER", event)
  event.preventDefault()
})
