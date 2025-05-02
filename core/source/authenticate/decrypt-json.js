export default function decryptJSON(secretKey, publicKey, encryptedMessage) {
  return JSON.parse(
    new TextDecoder().decode(
      decrypt(
        decodeBase64(secretKey),
        decodeBase64(publicKey),
        decodeBase64(encryptedMessage)
      )
    )
  )
}

const decrypt = (mySecretKey, theirPublicKey, encryptedMessageBufferWithNonce) => {
  const nonce = encryptedMessageBufferWithNonce.slice(0, box.nonceLength)
  const encryptedMessageBuffer = encryptedMessageBufferWithNonce.slice(box.nonceLength)
  const decrypted = box.open(encryptedMessageBuffer, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  return decrypted
}
