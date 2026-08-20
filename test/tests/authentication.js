import nacl from 'tweetnacl'
import { v5 as uuidv5 } from 'uuid'

const AUTH_SERVICE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA59Uz6jvBJF3B8/7xMqGo
XkIhLFvTCHuFIGuCNNZGCJUnSk2ne6Jp1ehUIarliJwzrvfr2HMe0PvzAJyZqQIs
uz0Lt867TTojCAKJunxbcrwEhzvz0FNjNu1wpgkSHFvd1uTvRSZqauqUmG0HqC17
HSmBaXivB49B/pviowVJc+mUJJ9MROtOiL4JN5niHnLbt6QVi6NITAJkOwtoRhck
5j0KLvfrq18R8QrfDOq3v5hWlrA6j1wPvTW1mzFk8MrOZw935mMDdMivFAm/DltM
NT5I3YnLZpcl1e/fydC+B6zSz2nZfLb2iDBbADDVj2+i9JUEFomg6ng1DjHUGMYc
ZQIDAQAB
-----END PUBLIC KEY-----`
const CREDENTIAL_NAMESPACE = '1b4555f2-a89c-4633-834a-a064c195ab22'
const encoder = new TextEncoder()

function encodeBase64(bytes) {
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}

function encryptJSON(secretKey, serverPublicKey, value) {
  const nonce = nacl.randomBytes(nacl.box.nonceLength)
  const ciphertext = nacl.box(
    encoder.encode(JSON.stringify(value)),
    nonce,
    decodeBase64(serverPublicKey),
    secretKey
  )
  const encrypted = new Uint8Array(nonce.length + ciphertext.length)
  encrypted.set(nonce)
  encrypted.set(ciphertext, nonce.length)
  return encodeBase64(encrypted)
}

function decodeBase64(value) {
  return Uint8Array.from(atob(value), character => character.charCodeAt(0))
}

function pemToArrayBuffer(pem) {
  const base64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  return decodeBase64(base64).buffer
}

async function encryptAuthPayload(value) {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(AUTH_SERVICE_PUBLIC_KEY),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  )
  const symmetricKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt']
  )
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    encoder.encode(JSON.stringify(value))
  )
  const exportedKey = await crypto.subtle.exportKey('raw', symmetricKey)
  const encryptedKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    exportedKey
  )

  return [iv, new Uint8Array(encryptedData), new Uint8Array(encryptedKey)]
    .map(bytes => encodeURIComponent(encodeBase64(bytes)))
    .join(',')
}

function withTimeout(promise, timeout, message) {
  let timeoutId
  return Promise.race([
    promise.finally(() => clearTimeout(timeoutId)),
    new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error(message)), timeout)
    })
  ])
}

export default function authentication(browserAgent) {
  describe('Authentication', function () {
    it('Authenticates user-created accounts', async function () {
      this.timeout(15000)

      const {
        auth: { user: owner },
        domain,
        serverPublicKey
      } = await Agent.environment()
      const user = uuid()
      const providerKeys = nacl.box.keyPair()
      const userKeys = nacl.box.keyPair()
      const userPublicKey = encodeBase64(userKeys.publicKey)
      const credentialId = uuidv5(userPublicKey, CREDENTIAL_NAMESPACE)
      const info = { name: `Created account ${user}`, picture: null }
      const providerEncryptedInfo = encryptJSON(providerKeys.secretKey, serverPublicKey, {
        user,
        info
      })
      const userEncryptedInfo = encryptJSON(userKeys.secretKey, serverPublicKey, {
        created: Date.now(),
        providerEncryptedInfo
      })

      Agent.create({ id: user, active: { createdByAuthenticationTest: true } })
      Agent.create({
        id: credentialId,
        active: {
          user,
          providerPublicKey: encodeBase64(providerKeys.publicKey)
        }
      })
      await Agent.synced()

      const code = await encryptAuthPayload({ userPublicKey, userEncryptedInfo })
      const token = await encryptAuthPayload({ domain, provider: owner, code })
      let nextToken = token
      const authenticatedAgent = browserAgent({
        unique: true,
        root: true,
        apiHost: process.env.API_HOST || 'socket-io.localhost:8765',
        getToken: () => {
          const value = nextToken
          nextToken = undefined
          return value
        }
      })

      try {
        const environment = await withTimeout(
          authenticatedAgent.environment(),
          10000,
          'Timed out authenticating the user-created account'
        )
        expect(environment.auth).to.include({ user, provider: owner })
        expect(environment.auth.info).to.deep.equal(info)
      }
      finally {
        authenticatedAgent.disconnect?.()
      }
    })
  })
}
