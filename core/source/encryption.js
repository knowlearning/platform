import nacl from 'tweetnacl'
import crypto from 'crypto'

const IV_LENGTH = 16

const { box, randomBytes } = nacl

export const generateKeyPair = () => box.keyPair()

export const encrypt = (mySecretKey, theirPublicKey, messageBuffer) => {
  const nonce = randomBytes(box.nonceLength)
  const encrypted = box(messageBuffer, nonce, theirPublicKey, mySecretKey)

  const fullMessage = new Uint8Array(nonce.length + encrypted.length)
  fullMessage.set(nonce)
  fullMessage.set(encrypted, nonce.length)

  return fullMessage
}

export const decrypt = (mySecretKey, theirPublicKey, encryptedMessageBufferWithNonce) => {
  const nonce = encryptedMessageBufferWithNonce.slice(0, box.nonceLength)
  const encryptedMessageBuffer = encryptedMessageBufferWithNonce.slice(box.nonceLength, encryptedMessageBufferWithNonce.length)
  const decrypted = box.open(encryptedMessageBuffer, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  return decrypted
}

const algorithm = 'aes-256-ctr'

export function encryptSymmetric(key, text) {
  const sized_encryption_key = Buffer.concat([Buffer.from(key), Buffer.alloc(32)], 32)
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(algorithm, Buffer.from(sized_encryption_key, 'hex'), iv)
  return `${iv.toString('hex')}:${Buffer.concat([cipher.update(text), cipher.final()]).toString('hex')}`
}

export function decryptSymmetric(key, text) {
  const sized_encryption_key = Buffer.concat([Buffer.from(key), Buffer.alloc(32)], 32)
  const textParts = text.split(':')
  const iv = Buffer.from(textParts.shift(), 'hex')
  const encryptedText = Buffer.from(textParts.join(':'), 'hex')
  const decipher = crypto.createDecipheriv(algorithm, Buffer.from(sized_encryption_key, 'hex'), iv)
  return Buffer.concat([decipher.update(encryptedText), decipher.final()]).toString()
}
