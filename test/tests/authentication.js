import nacl from 'tweetnacl'
import { v5 as uuidv5 } from 'uuid'
import { io } from 'socket.io-client'

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
const SESSION_TYPE = 'application/json;type=session'
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

function authenticationApiHost() {
  const environment = typeof process === 'undefined' ? {} : process.env
  return environment.API_HOST || localStorage.getItem('API_HOST') || 'socket-io.localhost:8765'
}

async function authenticationConnection({ sid=uuid(), token, session }={}) {
  const { domain } = await Agent.environment()
  const socket = io(`https://${authenticationApiHost()}`, {
    autoConnect: false,
    forceNew: true,
    reconnection: false,
    withCredentials: true,
    ...(typeof process !== 'undefined' && process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' ? { rejectUnauthorized: false } : {}),
    extraHeaders: { origin: `https://${domain}` }
  })
  const pending = new Map()
  let resolveAuthentication, rejectAuthentication
  const authenticated = new Promise((resolve, reject) => {
    resolveAuthentication = resolve
    rejectAuthentication = reject
  })
  socket.on('connect', () => socket.emit('message', { domain, sid, token, session }))
  socket.on('connect_error', rejectAuthentication)
  socket.on('message', message => {
    if (!message) return
    if (message.auth) resolveAuthentication(message)
    else if (message.si !== undefined) {
      socket.emit('message', { ack: message.si })
      pending.get(message.si)?.(message)
    }
    else if (message.error) rejectAuthentication(new Error(message.error))
  })
  const close = () => {
    socket.emit('message', { type: 'close' })
    socket.disconnect()
  }
  socket.connect()
  try {
    const environment = await withTimeout(authenticated, 10000, 'Timed out authenticating the test connection')
    let messageIndex = environment.ack ?? -1
    const interact = async (scope, patch) => {
      const index = ++messageIndex
      const response = new Promise(resolve => pending.set(index, resolve))
      socket.emit('message', { scope, patch, context: [], si: index })
      try {
        return await withTimeout(response, 5000, `Timed out waiting for authentication test message ${index}`)
      }
      finally { pending.delete(index) }
    }
    const initialized = await interact('sessions', [{
      op: 'add', path: ['active', environment.session], value: { queries: {}, subscriptions: {} }
    }])
    expect(initialized).not.to.have.property('error')
    const readState = scope => interact('sessions', [{
      op: 'add',
      path: ['active', environment.session, 'subscriptions', uuid()],
      value: { scope, user: environment.auth.user, domain, ii: null }
    }])
    return { environment, sid, interact, readState, close }
  }
  catch (error) {
    close()
    throw error
  }
}

export default function authentication(browserAgent) {
  describe('Authentication', function () {
    it('Persists core-owned sessions and restores them with and without a session ID', async function () {
      this.timeout(20000)
      const connections = []
      const connect = async options => {
        const connection = await authenticationConnection(options)
        connections.push(connection)
        return connection
      }

      try {
        const initial = await connect({ token: 'anonymous' })
        const { session, auth: { user, provider } } = initial.environment
        const saved = await initial.readState(session)
        expect(saved).to.include({ owner: 'core', active_type: SESSION_TYPE })
        expect(saved.active).to.include({ user_id: user, provider })
        initial.close()

        const reattached = await connect({ sid: initial.sid, session })
        expect(reattached.environment.session).to.equal(session)
        expect(reattached.environment.auth).to.include({ user, provider })
        reattached.close()

        const restored = await connect({ sid: initial.sid })
        expect(restored.environment.session).not.to.equal(session)
        expect(restored.environment.auth).to.include({ user, provider })
        const renewed = await restored.readState(restored.environment.session)
        expect(renewed).to.include({ owner: 'core', active_type: SESSION_TYPE })
        expect(renewed.active).to.include({ user_id: user, provider })
        expect(renewed.active.session_credential).to.equal(saved.active.session_credential)
      }
      finally { connections.forEach(connection => connection.close()) }
    })

    it('Rejects forged metadata and session patches without changing persisted state or blocking later writes', async function () {
      this.timeout(20000)
      const connection = await authenticationConnection({ token: 'anonymous' })
      const id = uuid()
      const { session, auth: { user } } = connection.environment
      const activePatch = [{ op: 'add', path: ['active'], value: { value: 'original' } }]

      try {
        expect(await connection.interact(id, activePatch)).not.to.have.property('error')
        const original = await connection.readState(id)
        const credential = await connection.readState(session)
        const metadataPatches = [
          { op: 'replace', path: ['owner'], value: 'core' },
          { op: 'replace', path: ['domain'], value: 'forged.example' },
          { op: 'replace', path: ['created'], value: 0 },
          { op: 'replace', path: ['active_type'], value: SESSION_TYPE }
        ]
        for (const patch of metadataPatches) {
          const response = await connection.interact(id, [
            { op: 'replace', path: ['active', 'value'], value: 'forged' },
            patch
          ])
          expect(response).to.have.property('error')
          const unchanged = await connection.readState(id)
          expect(unchanged.active).to.deep.equal(original.active)
          expect(unchanged).to.include({
            owner: user, domain: original.domain, created: original.created,
            active_type: original.active_type, ii: original.ii
          })
        }
        for (const patch of [
          { op: 'replace', path: ['active', 'user_id'], value: uuid() },
          { op: 'replace', path: ['active_type'], value: 'application/json' }
        ]) {
          expect(await connection.interact(session, [patch])).to.have.property('error')
        }
        const unchangedCredential = await connection.readState(session)
        expect(unchangedCredential.active).to.deep.equal(credential.active)
        expect(unchangedCredential).to.include({ owner: 'core', active_type: SESSION_TYPE, ii: credential.ii })

        const accepted = await connection.interact(id, [
          { op: 'replace', path: ['active', 'value'], value: 'accepted' }
        ])
        expect(accepted).not.to.have.property('error')
        expect((await connection.readState(id)).active).to.deep.equal({ value: 'accepted' })
      }
      finally { connection.close() }
    })

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
        apiHost: authenticationApiHost(),
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
        expect(await authenticatedAgent.metadata(environment.session))
          .to.include({ owner: 'core', active_type: SESSION_TYPE })
        expect(await authenticatedAgent.state(environment.session)).to.include({ user_id: user, provider: owner })
      }
      finally {
        authenticatedAgent.disconnect?.()
      }
    })
  })
}
