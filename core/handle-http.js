import fetch from 'node-fetch'
import { validate as validateUUID } from 'uuid'
import { client, connected } from './redis.js'
import { download } from './storage.js'

let resolveConfig
const configPromise = new Promise(r => resolveConfig = r)

pollForConfig()

export default async function handleHTTP(req, res) {
  try {
    await connected

    const { pathname, hostname } = new URL (req.url, `https://${req.headers.host}`)

    if      (isIPAddress(hostname)              ) emptyResponse(res)
    else if (isWellKnownPath(pathname)          ) handleWellKnownPath(req, res)
    else if (fromSecureOrigin(req)              ) coreBrowserResponse(req, res)
    else if (await isHTTPSRedirectable(hostname)) HTTPSRedirect(req, res)
    else {
      console.log('TODO: initiate request for tls cert for', hostname, 'FROM HOST', req.headers.host)
      //await initiateTLSCertRequest(hostname)
      coreBrowserResponse(req, res)
    }
  }
  catch (error) {
    console.warn(error)
    res.writeHead(200)
    res.end()
  }
}

//  TODO: better config verification... maybe do config update in 1 shot from config agent?
async function pollForConfig() {
  await connected
  const c = await client.json.get('core/config/config', { path: 'state' })
  if (c && c.root && c.embed) resolveConfig(c)
  else {
    await new Promise(r => setTimeout(r, 1000))
    pollForConfig()
  }
}

function isIPAddress(hostname) {
  return /^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$/.test(hostname)
}

function HTTPSRedirect(req, res) {
  const redirectHost = MODE === 'local' ? req.headers.host.replace(':32010', ':32001') : req.headers.host
  res.writeHead(302, { Location: `https://${redirectHost}${req.url}`})
  res.end()
}

async function pipeResponse(url, res) {
  const { headers, body } = await fetch(url)
  res.writeHead(200, {'Content-Type': headers.get('Content-type')})
  body.pipe(res)
}

function redirect(url, res) {
  res.writeHead(302, { Location: url })
  res.end()
}

async function coreBrowserResponse(req, res) {
  const { hostname, pathname } = new URL (req.url, `https://${req.headers.host}`)
  //  TODO: send built file from admin config instead of this config
  const { root } = await configPromise
  const id = pathname.slice(1)

  if (validateUUID(id)) {
    const url = await download(id)
    redirect(url, res)
  }
  else {
    const url = await download(root, 3, true)
    pipeResponse(url, res)
  }
}

function isWellKnownPath(pathname) {
  return pathname === '/favicon.ico' || pathname.startsWith('/.well-known/')
}

function ACMEChallengeResponse(res, hostname, pathname) {
  console.log('GOT ACME CHALLENGE', hostname, pathname)
  res.end()
}

function handleWellKnownPath(req, res) {
  const { pathname, hostname } = new URL (req.url, `https://${req.headers.host}`)

  if (pathname === '/favicon.ico') emptyResponse(res)
  else {
    const sections = pathname.split('/')

    const handlers = {
      'acme-challenge': () => ACMEChallengeResponse(res, hostname, pathname),
      'microsoft-identity-association.json': () => MicrosoftIdentityAssociationResponse(res)
    }

    handlers[sections[2]]()
  }
}

function fromSecureOrigin(req) {
  return req.headers['x-forwarded-proto'] === 'https' || req.connection.encrypted
}

function replaceSubdomainWithWildcard(hostname) {
  return `*.${hostname.split('.').slice(1).join('.')}`
}

async function isHTTPSRedirectable(domain) {
  await connected

  const wildcardDomain = replaceSubdomainWithWildcard(domain)
  const path = [`$.state["${domain}"]`, `$.state["${wildcardDomain}"]`]
  const res = await client.json.get('core/core/tls', { path })
  const explicitTLSConfig = res && res[path[0]][0]
  const wildcardTLSConfig = res && res[path[1]][0]
  return explicitTLSConfig || wildcardTLSConfig
}

function emptyResponse(res) {
  res.writeHead(200)
  res.end()
}
