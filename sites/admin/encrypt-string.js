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

export default async function encryptString(theirPublicKey, plainText) {
  const { publicKey, secretKey } =  await generateKeyPair()

  const encrypted = encrypt(secretKey, decodeBase64(theirPublicKey), new TextEncoder().encode(plainText))
  const combined = new Uint8Array(publicKey.length + encrypted.length)

  combined.set(publicKey)
  combined.set(encrypted, publicKey.length)

  return encodeBase64(combined)
}

function decryptString(secretKey, encryptedText) {
  const data = decodeBase64(encryptedText)
  const publicKey = data.slice(0, 32)
  const ciphertext = data.slice(32)

  return encodeUTF8(
    decrypt(
      ciphertext,
      publicKey,
      decodeBase64(secretKey)
    )
  )
}
