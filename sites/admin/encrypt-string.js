import { box, randomBytes, secretbox } from 'tweetnacl'
import { encodeBase64, decodeBase64, encodeUTF8, decodeUTF8 } from 'tweetnacl-util'

export const generateKeyPair = async key => {
  if (key) {
    const keyBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key))
    return box.keyPair.fromSecretKey(new Uint8Array(keyBuffer))
  }
  else return box.keyPair()
}

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
  const encryptedMessageBuffer = encryptedMessageBufferWithNonce.slice(box.nonceLength)
  const decrypted = box.open(encryptedMessageBuffer, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  return decrypted
}

export default async function encryptString(publicKey, plainText) {
  const { secretKey } =  await generateKeyPair()
  return encodeBase64(
    encrypt(secretKey, decodeBase64(publicKey), decodeUTF8(plainText))
  )
}
