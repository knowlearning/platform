const AUTH_HOST = 'https://auth.knowlearning.systems'
const CORE_AUTH_SERVICE_PUBLIC_KEY = `-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEA59Uz6jvBJF3B8/7xMqGo
XkIhLFvTCHuFIGuCNNZGCJUnSk2ne6Jp1ehUIarliJwzrvfr2HMe0PvzAJyZqQIs
uz0Lt867TTojCAKJunxbcrwEhzvz0FNjNu1wpgkSHFvd1uTvRSZqauqUmG0HqC17
HSmBaXivB49B/pviowVJc+mUJJ9MROtOiL4JN5niHnLbt6QVi6NITAJkOwtoRhck
5j0KLvfrq18R8QrfDOq3v5hWlrA6j1wPvTW1mzFk8MrOZw935mMDdMivFAm/DltM
NT5I3YnLZpcl1e/fydC+B6zSz2nZfLb2iDBbADDVj2+i9JUEFomg6ng1DjHUGMYc
ZQIDAQAB
-----END PUBLIC KEY-----
`
// auth token info is sent with pathnames of form /auth/VERIFICATION_STATE/PROVIDER_TOKEN
if (window.location.pathname.startsWith('/auth/')) {
  const state_token = window.location.pathname.slice(6)
  const [state] = state_token.split('/', 1)
  const origin = window.localStorage.getItem(state)
  if (origin) {
    const token = state_token.slice(state.length + 1)
    window.localStorage.setItem('token', token)
    window.location.href = origin
  }
}

async function login(provider='google', code) {
  const state = Math.random().toString(36).substring(2)
  window.localStorage.setItem(state, window.location.href)

  if (provider === 'code') {
    const tokenContents = { code, provider, domain: window.location.host }
    const token = await encryptString(CORE_AUTH_SERVICE_PUBLIC_KEY, JSON.stringify(tokenContents))
    window.location.href = `/auth/${state}/${token}`
  }
  else {
    const redirect = encodeURIComponent(window.location.href)
    window.location.href = `${AUTH_HOST}/${provider}/${state}/${redirect}`
   }
}

function logout() {
  //  Doing this will establish a new anonymous session
  window.localStorage.setItem('token', Math.random().toString(36).substring(2))
  window.location.reload()
}

async function getToken() {
  const token = localStorage.getItem('token')
  window.localStorage.removeItem('token')
  return token
}


async function encryptString(publicKeyPem, plainText) {
  const publicKey = await crypto.subtle.importKey(
    'spki',
    pemToArrayBuffer(publicKeyPem),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    true,
    ['encrypt']
  )

  const symmetricKey = await crypto.subtle.generateKey(
    { name: 'AES-GCM', length: 256 },
    true,
    ['encrypt', 'decrypt']
  )

  const encodedPlainText = new TextEncoder().encode(plainText);
  const iv = crypto.getRandomValues(new Uint8Array(12))
  const encryptedData = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    symmetricKey,
    encodedPlainText
  )

  const exportedSymmetricKey = await crypto.subtle.exportKey('raw', symmetricKey)

  const encryptedSymmetricKey = await crypto.subtle.encrypt(
    { name: 'RSA-OAEP' },
    publicKey,
    exportedSymmetricKey
  )

  const serialized = [
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(iv)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(encryptedData)))),
    encodeURIComponent(btoa(String.fromCharCode(...new Uint8Array(encryptedSymmetricKey))))
  ].join(',')

  return serialized
}

function pemToArrayBuffer(pem) {
  const b64 = pem.replace(/-----[^-]+-----/g, '').replace(/\s/g, '')
  const binary = atob(b64)
  const array = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) {
    array[i] = binary.charCodeAt(i)
  }
  return array.buffer
}

export {
  getToken,
  login,
  logout
}

