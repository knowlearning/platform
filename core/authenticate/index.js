import fs from 'fs'
import { v4 as uuid } from 'uuid'
import jwkToPem from 'jwk-to-pem'
import jwt from 'jsonwebtoken'
import https from 'https'
import interact from '../interact/index.js'
import { query } from '../postgres.js'

const USER_TYPE = 'application/json;type=user'
const SESSION_TYPE = 'application/json;type=session'
const REATTACHING_SESSION_QUERY = `
  SELECT
    sessions.id as id,
    user_id,
    provider,
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
    created
  FROM sessions
  JOIN metadata
    ON metadata.id = sessions.id
  WHERE session_credential = $1
  ORDER BY created DESC LIMIT 1
`
const { ADMIN_DOMAIN, GOOGLE_OAUTH_CLIENT_CREDENTIALS } = process.env

const {
  web: {
    client_id: GOOGLE_OAUTH_CLIENT_ID,
    client_secret: GOOGLE_OAUTH_CLIENT_SECRET,
    token_uri: GOOGLE_OAUTH_TOKEN_URI
  }
} = JSON.parse(GOOGLE_OAUTH_CLIENT_CREDENTIALS)

const GOOGLE_OPENID_CONFIG = 'https://accounts.google.com/.well-known/openid-configuration'

const ISS_TO_PROVIDER_MAP = {
  'https://accounts.google.com': 'google',
  'accounts.google.com': 'google'
}

export default async function authenticate(message, domain, session_credential) {
  let user, provider, session
  if (!message.token) {
    try {
      if (message.session) {
        //  find session to reattach to
        const { rows } = await query(domain, REATTACHING_SESSION_QUERY, [session_credential, message.session])
        //  TODO: throw error if no rows
        if (rows[0]) {
          user = rows[0].user_id
          provider = rows[0].provider
          session = message.session
          return { user, provider, session }
        }
      }

      const { rows } = await query(domain, NEW_SESSION_QUERY, [session_credential])
      if (rows[0]) {
        user = rows[0].user_id
        provider = rows[0].provider
        session = uuid()
        await saveSession(domain, session, session_credential, user, provider)
        return { user, provider, session }
      }
    }
    catch (error) { console.warn('error reconnecting session', error) }
  }
  let authority

  if (message.token === 'anonymous') authority = 'anonymous'
  else if (domain === 'core') authority = 'core'
  else authority = 'JWT'

  const authResponse = await authenticateToken(message.token, authority)
  user = authResponse.user
  session = uuid()
  console.log('NEW SESSION FOR USER', user, domain, session)

  //  TODO: consider storing at domain instead of core
  const { provider_id, credential } = authResponse
  provider = authResponse.provider

  //  TODO: save user info as appropriate

  await saveSession(domain, session, session_credential, user, provider)

  return { user, provider, session }
}

async function saveSession(domain, session, session_credential, user, provider) {
  const sessionPatch = [
    { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
    {
      op: 'add',
      value: {
        session_credential,
        user_id: user,
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
    JWTVerification(token, resolve, reject)
  }
  else {
    //  TODO: allow anonymous accounts to live beyond refresh
    const provider_id = uuid()
    resolve({
      user: provider_id,
      provider_id,
      provider: 'anonymous'
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
          resolve({ provider: 'core', provider_id, user })
        })
      })
    })
}

const googleJWKs = {}

async function fetchGoogleJWKs(retries=0) {
  if (retries > 3) throw new Error('Could not fetch google public keys')

  const { jwks_uri } = await fetchJSON(GOOGLE_OPENID_CONFIG)
  return (
    fetchJSON(jwks_uri)
      .then(({ keys }) => keys.forEach(k => googleJWKs[k.kid] = k))
      .catch(error => {
        console.warn(error)
        fetchGoogleJWKs(retries + 1)
      })
  )
}

async function JWTVerification(token, resolve, reject) {
  const i = token.indexOf('-')
  const provider = token.substr(0,i)
  //  TODO: use provider info to differentiate different tokens
  const code = token.substr(i+1)

  //  TODO: use access token for refresh and such...
  const response = await fetch(GOOGLE_OAUTH_TOKEN_URI, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: `client_id=${GOOGLE_OAUTH_CLIENT_ID}&client_secret=${GOOGLE_OAUTH_CLIENT_SECRET}&code=${code}&grant_type=authorization_code&redirect_uri=https://auth.knowlearning.systems/`
  }).then(r => r.json())

  if (response.error) return reject(response.error)

  const { id_token } = response // TODO: probably want to store access token...
  const kid = kidFromToken(id_token)

  if (!googleJWKs[kid]) await fetchGoogleJWKs()
  if (!googleJWKs[kid]) return reject('Public key not found')

  jwt.verify(id_token, jwkToPem(googleJWKs[kid]), async (error, decoded) => {
    if (error) return reject(error)

    if (passGoogleTokenChallenge(decoded)) {
      const provider_id = decoded.sub
      const provider = ISS_TO_PROVIDER_MAP[decoded.iss]
      const { rows: [ existingUser ]} = await query(ADMIN_DOMAIN, `SELECT id FROM users WHERE provider = $1 AND provider_id = $2`, [provider, provider_id])
      const user = existingUser ? existingUser.id : uuid()
      resolve({ provider, provider_id, user })
    }
    else reject('Google JWT Expectation Failed')
  })
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
