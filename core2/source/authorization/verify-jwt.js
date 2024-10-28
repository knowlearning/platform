import { uuid, decodeBase64String, jwkToPem, jwt, environment } from './externals.js'

const JWT_VERIFICATION_TIMEOUT = 2500

const JWKS_ENDPOINTS = {
  google: 'https://accounts.google.com/.well-known/openid-configuration',
  microsoft: 'https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration',
  classlink: 'https://launchpad.classlink.com/.well-known/openid-configuration'
}

const OAuthClientInfo = JSON.parse(environment.OAUTH_CREDENTIALS)

export default async function JWTVerification(provider, code, resolve, reject) {
  if (provider === 'core') return coreVerfication(code, resolve, reject)

  setTimeout(
    () => reject('JWT_VERIFICATION_TIMEOUT time elapsed'),
    JWT_VERIFICATION_TIMEOUT
  )

  const { web: { client_id, client_secret, token_uri } } = OAuthClientInfo[provider.toUpperCase()]

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
      const { name, picture } = decoded
      resolve({ provider, provider_id, info: { name, picture } })
    }
    else {
      console.warn('JWT Expectation Failed', error)
      reject('Google JWT Expectation Failed')
    }
  })
}

function kidFromToken(token) {
  //  get kid header from token
  const { kid } = JSON.parse(decodeBase64String(token.split('.').shift()))
  return kid
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
    aud === OAuthClientInfo.CLASSLINK.web.client_id &&
    'https://launchpad.classlink.com' === iss
  )
}

function passGoogleTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  return (
    exp > now &&
    iat < now &&
    aud === OAuthClientInfo.GOOGLE.web.client_id &&
    ['accounts.google.com', 'https://accounts.google.com'].includes(iss)
  )
}

function passMicrosoftTokenChallenge({ exp, iat, aud, iss }) {
  const now = Math.ceil(Date.now() / 1000)

  // iss is different based on the microsoft users organization
  return (
    exp > now &&
    iat < now &&
    aud === OAuthClientInfo.MICROSOFT.web.client_id
  )
}

async function fetchJSON(url) {
  const r = await fetch(url, { signal: AbortSignal.timeout(3000) })
  return await r.json()
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
