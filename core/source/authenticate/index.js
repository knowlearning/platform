import { jwt, jwkToPem, uuid, environment, decryptSymmetric, decodeBase64String, decryptBase64String } from '../utils.js'
import saveSession from './save-session.js'
import * as hash from './hash.js'
import interact from '../interact/index.js'
import { query } from '../postgres.js'

const {
  ADMIN_DOMAIN,
  AUTH_SERVICE_SECRET_KEY,
  GOOGLE_OAUTH_CLIENT_CREDENTIALS,
  MICROSOFT_OAUTH_CLIENT_CREDENTIALS,
  CLASSLINK_OAUTH_CLIENT_CREDENTIALS
} = environment

const JWKS_ENDPOINTS = {
  google: 'https://accounts.google.com/.well-known/openid-configuration',
  microsoft: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  classlink: 'https://launchpad.classlink.com/.well-known/openid-configuration'
}
const JWT_VERIFICATION_TIMEOUT = 2500
const USER_TYPE = 'application/json;type=user'
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

const EXISTING_USER_QUERY = `
  SELECT u.id
  FROM users u
  JOIN metadata m ON m.id = u.id
  WHERE u.provider = $1
    AND u.provider_id = $2
  ORDER BY m.created ASC LIMIT 1
`

const OAuthClientInfo = {
  google: JSON.parse(GOOGLE_OAUTH_CLIENT_CREDENTIALS).web,
  microsoft: JSON.parse(MICROSOFT_OAUTH_CLIENT_CREDENTIALS).web,
  classlink: JSON.parse(CLASSLINK_OAUTH_CLIENT_CREDENTIALS).web
}

async function decryptAndParseSessionInfo(key, encrypted) {
  try {
    return JSON.parse(await decryptSymmetric(key, encrypted))
  }
  catch (error) {
    console.warn(error)
    return {}
  }
}

async function getExistingUser(provider, provider_id) {
  const { rows: [ existingUser ]} = await query(
    ADMIN_DOMAIN,
    EXISTING_USER_QUERY,
    [provider, provider_id]
  )
  return existingUser
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
            info: await decryptAndParseSessionInfo(sid, rows[0].sid_encrypted_info)
          }
        }
      }

      const { rows } = await query(domain, NEW_SESSION_QUERY, [session_credential])
      if (rows[0]) {
        const user = rows[0].user_id
        const { provider, sid_encrypted_info } = rows[0]
        const info = await decryptAndParseSessionInfo(sid, sid_encrypted_info)
        const session = uuid()
        await saveSession(domain, session, sid, user, provider, info)
        return { user, provider, session, info }
      }
    }
    catch (error) { console.warn('error reconnecting session', domain, message, error) }
  }

  let authority

  if (message.token === 'anonymous' || message.token === 'anonymous-ephemeral') {
    authority = 'anonymous'
  }
  else if (domain === 'core') authority = 'core'
  else authority = 'JWT'

  const session = uuid()
  const { user, provider, provider_id, info } = await authenticateToken(domain, message.token, authority)
  console.log('NEW SESSION FOR USER', user, domain, session.slice(0, 4))

  const userPatch = [
    { op: 'add', value: USER_TYPE, path: ['active_type'] },
    { op: 'add', value: { provider_id, provider }, path: ['active'] }
  ]

  await interact(ADMIN_DOMAIN, 'users', user, userPatch)

  if (message.token !== 'anonymous-ephemeral') {
    //  TODO: consider leaving a record of the ephemeral user session, but
    //        just not associating with session_credential
    //        'anonymous-ephemeral' tokens are used in tests to create multiple agents in the
    //        same browser tab
    await saveSession(domain, session, sid, user, provider, info)
  }

  return { user, provider, session, info }
}

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
  return await r.json()
}

function kidFromToken(token) {
  //  get kid header from token
  const { kid } = JSON.parse(decodeBase64String(token.split('.').shift()))
  return kid
}

const authenticateToken = (domain, token, authority) => new Promise( async (resolve, reject) => {
  if (authority === 'core') coreVerfication(token, resolve, reject)
  else if (!token) resolve(anonymousProviderResponse(uuid()))
  else {
    if (domain === 'localhost:5113') {
      const { domain: tokenDomain, provider, code } = await decryptBase64String(AUTH_SERVICE_SECRET_KEY, token)
      if (tokenDomain !== domain) {
        reject(`INVALID TOKEN DOMAIN: ${domain} != ${tokenDomain}`)
        return
      }
    }
    else {
      const i = token.indexOf('-')
      const provider = token.substr(0,i)
      const code = token.substr(i+1)
    }

    if (OAuthClientInfo[provider]) JWTVerification(provider, code, resolve, reject)
    else resolve(anonymousProviderResponse(uuid()))
  }
})

function anonymousProviderResponse(id) {
  return {
    user: id,
    provider_id: id,
    provider: 'anonymous',
    info: { name: 'anonymous', picture: null }
  }
}

async function coreVerfication(token, resolve, reject) {
  throw new Error('TODO: consider core verification')
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
          try {
            const existingUser = await getExistingUser('core', provider_id)
            const user = existingUser ? existingUser.id : uuid()
            const info = { name: provider_id, picture: null }
            resolve({ provider: 'core', provider_id, user, info })
          }
          catch (existingUserError) {
            console.warn('EXISTING USER ERROR', existingUserError)
            reject(existingUserError)
          }
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

async function JWTVerification(provider, code, resolve, reject) {
  setTimeout(
    () => {
      console.warn('JWT_VERIFICATION_TIMEOUT time elapsed')
      reject('JWT_VERIFICATION_TIMEOUT time elapsed')
    },
    JWT_VERIFICATION_TIMEOUT
  )

  const { client_id, client_secret, token_uri } = OAuthClientInfo[provider]

  //  TODO: use access token for refresh and such...
  const response = await fetch(token_uri, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded'
    },
    body: new URLSearchParams({
      client_id,
      client_secret,
      code,
      grant_type: 'authorization_code',
      redirect_uri: 'https://auth.knowlearning.systems/'
    }).toString()
  }).then(r => r.json())

  if (response.error) return reject(response.error)

  const { id_token } = response // TODO: probably want to store access token...
  const kid = kidFromToken(id_token)

  if (!providerJWKs[provider][kid]) await fetchJWKs(provider)
  if (!providerJWKs[provider][kid]) return reject('Public key not found')

  const encoded = jwkToPem(providerJWKs[provider][kid])
  jwt.verify(id_token, encoded, async (error, decoded, claims) => {
    if (error) return reject(error)

    if (passTokenChallenge(provider, decoded)) {
      const provider_id = decoded.sub
      try {
        const existingUser = await getExistingUser(provider, provider_id)
        const user = existingUser ? existingUser.id : uuid()
        const { name, picture } = decoded
        resolve({ provider, provider_id, user, info: { name, picture } })
      }
      catch (existingUserError) {
        console.warn('EXISTING USER ERROR', existingUserError)
        reject('Issue Fetching Existing User')
      }
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

  return (
    exp > now &&
    iat < now &&
    aud === OAuthClientInfo.classlink.client_id &&
    'https://launchpad.classlink.com' === iss
  )
}

function passGoogleTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  return (
    exp > now &&
    iat < now &&
    aud === OAuthClientInfo.google.client_id &&
    ['accounts.google.com', 'https://accounts.google.com'].includes(iss)
  )
}


function passMicrosoftTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  // iss is different based on the microsoft users organization
  return (
    exp > now &&
    iat < now &&
    aud === OAuthClientInfo.microsoft.client_id
  )
}
