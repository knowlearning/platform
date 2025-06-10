
export default async function encryptString(publicKeyPem, plainText) {
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