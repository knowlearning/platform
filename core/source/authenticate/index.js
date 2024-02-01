import fs from 'fs'
import { v4 as uuid } from 'uuid'
import jwkToPem from 'jwk-to-pem'
import jwt from 'jsonwebtoken'
import https from 'https'
import interact from '../interact/index.js'
import { query } from '../postgres.js'
import { encryptSymmetric, decryptSymmetric } from '../encryption.js'
import * as hash from './hash.js'

const {
  ADMIN_DOMAIN,
  GOOGLE_OAUTH_CLIENT_CREDENTIALS,
  MICROSOFT_OAUTH_CLIENT_CREDENTIALS,
  CLASSLINK_OAUTH_CLIENT_CREDENTIALS
} = process.env

const JWKS_ENDPOINTS = {
  google: 'https://accounts.google.com/.well-known/openid-configuration',
  microsoft: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  classlink: 'https://launchpad.classlink.com/.well-known/openid-configuration'
}

const USER_TYPE = 'application/json;type=user'
const SESSION_TYPE = 'application/json;type=session'
const REATTACHING_SESSION_QUERY = `
  SELECT
    sessions.id as id,
    user_id,
    provider,
    sid_encrypted_info,
    created
  FROM sessions
  JOIN metadata
    ON metadata.id = sessions.id
  WHERE session_credential = $1
    AND sessions.id = $2
  ORDER BY created DESC LIMIT 1
`

const NEW_SESSION_QUERY = `
  SELECT
    user_id,
    provider,
    sid_encrypted_info,
    created
  FROM sessions
  JOIN metadata
    ON metadata.id = sessions.id
  WHERE session_credential = $1
  ORDER BY created DESC LIMIT 1
`

const {
  web: {
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    token_uri: GOOGLE_OAUTH_TOKEN_URI
  }
} = JSON.parse(GOOGLE_OAUTH_CLIENT_CREDENTIALS)

const {
  web: {
    client_id: MICROSOFT_OAUTH_CLIENT_ID,
    client_secret: MICROSOFT_OAUTH_CLIENT_SECRET,
    token_uri: MICROSOFT_OAUTH_TOKEN_URI
  }
} = JSON.parse(MICROSOFT_OAUTH_CLIENT_CREDENTIALS)

const {
  web: {
    client_id: CLASSLINK_OAUTH_CLIENT_ID,
    client_secret: CLASSLINK_OAUTH_CLIENT_SECRET,
    token_uri: CLASSLINK_OAUTH_TOKEN_URI
  }
} = JSON.parse(CLASSLINK_OAUTH_CLIENT_CREDENTIALS)

function decryptAndParseSessionInfo(key, encrypted) {
  try {
    return JSON.parse(decryptSymmetric(key, encrypted))
  }
  catch (error) {
    console.warn(error)
    return {}
  }
}

export default async function authenticate(message, domain, sid) {
  const session_credential = await hash.create(sid)

  if (!message.token) {
    try {
      if (message.session) {
        //  find session to reattach to
        const { rows } = await query(domain, REATTACHING_SESSION_QUERY, [session_credential, message.session])
        //  TODO: throw error if no rows
        if (rows[0]) {
          return {
            user: rows[0].user_id,
            provider: rows[0].provider,
            session: message.session,
            info: decryptAndParseSessionInfo(sid, rows[0].sid_encrypted_info)
          }
        }
      }

      const { rows } = await query(domain, NEW_SESSION_QUERY, [session_credential])
      if (rows[0]) {
        const user = rows[0].user_id
        const { provider, sid_encrypted_info } = rows[0]
        const info = decryptAndParseSessionInfo(sid, sid_encrypted_info)
        const session = uuid()
        await saveSession(domain, session, session_credential, user, provider, sid_encrypted_info)
        return { user, provider, session, info }
      }
    }
    catch (error) { console.warn('error reconnecting session', error) }
  }

  let authority

  if (message.token === 'anonymous') authority = 'anonymous'
  else if (domain === 'core') authority = 'core'
  else authority = 'JWT'

  const session = uuid()
  const { user, provider, provider_id, info } = await authenticateToken(message.token, authority)
  console.log('NEW SESSION FOR USER', user, domain, session)

  const userPatch = [
    { op: 'add', value: USER_TYPE, path: ['active_type'] },
    { op: 'add', value: { provider_id, provider }, path: ['active'] }
  ]

  await interact(ADMIN_DOMAIN, 'users', user, userPatch)

  const sid_encrypted_info = encryptSymmetric(sid, JSON.stringify(info))
  await saveSession(domain, session, session_credential, user, provider, sid_encrypted_info)

  return { user, provider, session, info }
}

async function saveSession(domain, session, session_credential, user, provider, sid_encrypted_info) {
  const sessionPatch = [
    { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
    {
      op: 'add',
      value: {
        session_credential,
        user_id: user,
        sid_encrypted_info,
        provider
      },
      path: ['active']
    }
  ]
  await interact(domain, user, session, sessionPatch)
}

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
  return await r.json()
}

function kidFromToken(token) {
  //  get kid header from token
  const { kid } = JSON.parse(Buffer.from(token.split('.').shift(), "base64"))
  return kid
}

const authenticateToken = (token, authority) => new Promise( async (resolve, reject) => {
  if (authority === 'core') {
    coreVerfication(token, resolve, reject)
  }
  else if (token && token.startsWith('google-')) {
    JWTVerification(
      GOOGLE_OAUTH_CLIENT_ID,
      GOOGLE_OAUTH_CLIENT_SECRET,
      GOOGLE_OAUTH_TOKEN_URI,
      token,
      resolve,
      reject
    )
  }
  else if (token && token.startsWith('microsoft-')) {
    JWTVerification(
      MICROSOFT_OAUTH_CLIENT_ID,
      MICROSOFT_OAUTH_CLIENT_SECRET,
      MICROSOFT_OAUTH_TOKEN_URI,
      token,
      resolve,
      reject
    )
  }
  else if (token && token.startsWith('classlink-')) {
    JWTVerification(
      CLASSLINK_OAUTH_CLIENT_ID,
      CLASSLINK_OAUTH_CLIENT_SECRET,
      CLASSLINK_OAUTH_TOKEN_URI,
      token,
      resolve,
      reject
    )
  }
  else {
    //  TODO: allow anonymous accounts to live beyond refresh
    const provider_id = uuid()
    resolve({
      user: provider_id,
      provider_id,
      provider: 'anonymous',
      info: { name: 'anonymous', picture: null }
    })
  }
})

async function coreVerfication(token, resolve, reject) {
  const kid = kidFromToken(token)

  const ownToken = await fs.promises.readFile('/var/run/secrets/kubernetes.io/serviceaccount/token')
  const certAuthority = await fs.promises.readFile('/var/run/secrets/kubernetes.io/serviceaccount/ca.crt')
  //  fetch JSON Web Keys
  https
    .get({
      host: 'kubernetes.default.svc',
      defaultPort: 443,
      path: '/openid/v1/jwks',
      ca: `${certAuthority}`,
      headers: {
        Authorization: `Bearer ${ownToken}`
      }
    }, res => {
      const data = []
      res.on('data', chunk => data.push(chunk))
      res.on('end', () => {
        const JWKS = JSON.parse(data.join(''))
        const jwk = JWKS.keys.filter(({ kid: _kid }) => kid === _kid )[0]
        jwt.verify(token, jwkToPem(jwk), async (error, decoded) => {
          if (error) return reject(error)

          const kio = decoded['kubernetes.io']
          const provider_id = kio.serviceaccount.name
          const { rows: [ existingUser ]} = await query(ADMIN_DOMAIN, `SELECT id FROM users WHERE provider = 'core' AND provider_id = $1`, [provider_id])
          const user = existingUser ? existingUser.id : uuid()
          const info = { name: provider_id, picture: null }
          resolve({ provider: 'core', provider_id, user, info })
        })
      })
    })
}

// set up providerJWKs entry for all providers in JWKS_ENDPOINTS
const providerJWKs = Object.fromEntries(
  Object
    .keys(JWKS_ENDPOINTS)
    .map(provider => [provider, {}])
)


async function fetchJWKs(provider, retries=0) {
  if (retries > 3) throw new Error(`Could not fetch ${provider} public keys`)
    console

  const endpoint = JWKS_ENDPOINTS[provider]

  const { jwks_uri } = await fetchJSON(endpoint)

  return (
    fetchJSON(jwks_uri)
      .then(({ keys }) => {
        keys.forEach(k => providerJWKs[provider][k.kid] = k)
      })
      .catch(error => {
        console.warn(error)
        fetchJWKs(provider, retries + 1)
      })
  )
}

async function JWTVerification(client_id, client_secret, token_uri, token, resolve, reject) {
  const i = token.indexOf('-')
  const provider = token.substr(0,i)
  //  TODO: use provider info to differentiate different tokens
  const code = token.substr(i+1)

  //  TODO: use access token for refresh and such...
  const response = await fetch(token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `client_id=${client_id}&client_secret=${client_secret}&code=${code}&grant_type=authorization_code&redirect_uri=https://auth.knowlearning.systems/`
  }).then(r => r.json())

  if (response.error) return reject(response.error)

  const { id_token } = response // TODO: probably want to store access token...
  const kid = kidFromToken(id_token)

  if (!providerJWKs[provider][kid]) await fetchJWKs(provider)
  if (!providerJWKs[provider][kid]) return reject('Public key not found')

  const encoded = jwkToPem(providerJWKs[provider][kid])
  console.log('encoded', id_token, encoded)
  jwt.verify(id_token, encoded, async (error, decoded, claims) => {
    if (error) return reject(error)

    console.log('decoded', decoded, claims)

    if (passTokenChallenge(provider, decoded)) {
      const provider_id = decoded.sub
      const { rows: [ existingUser ]} = await query(ADMIN_DOMAIN, `SELECT id FROM users WHERE provider = $1 AND provider_id = $2`, [provider, provider_id])
      const user = existingUser ? existingUser.id : uuid()
      const { name, picture } = decoded
      resolve({ provider, provider_id, user, info: { name, picture } })
    }
    else {
      console.warn('JWT Expectation Failed', error)
      reject('Google JWT Expectation Failed')
    }
  })
}

function passTokenChallenge(provider, decoded) {
  if (provider === 'google') return passGoogleTokenChallenge(decoded)
  if (provider === 'microsoft') return passMicrosoftTokenChallenge(decoded)
  if (provider === 'classlink') return passClassLinkTokenChallenge(decoded)
  else return false
}

function passClassLinkTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  console.log('GOT CLASSLINK CRED FROM ISS TO AUD', iss, aud)

  return (
    exp > now &&
    iat < now &&
    aud === CLASSLINK_OAUTH_CLIENT_ID &&
    'https://launchpad.classlink.com' === iss
  )
}

function passGoogleTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  return (
    exp > now &&
    iat < now &&
    aud === GOOGLE_OAUTH_CLIENT_ID &&
    ['accounts.google.com', 'https://accounts.google.com'].includes(iss)
  )
}


function passMicrosoftTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  console.log('GOT MICROSOFT CRED FROM ISS TO AUD', iss, aud)

  return (
    exp > now &&
    iat < now &&
    aud === MICROSOFT_OAUTH_CLIENT_ID
// TODO: consider if we want to limit issuers
//  iss === 'https://login.microsoftonline.com/0b6880c6-6e1b-46b5-9918-bad3eb00b24a/v2.0'
  )
}
