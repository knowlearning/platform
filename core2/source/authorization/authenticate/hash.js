import { cryptoDigest } from '../externals.js'

async function create(clear) {
  const encoder = new TextEncoder()
  const data = encoder.encode(clear)
  const hashBuffer = await cryptoDigest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

async function verify(clear, hash) {
  return hash === await create(clear)
}

export { create, verify }
