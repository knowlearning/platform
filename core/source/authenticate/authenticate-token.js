import { uuid, environment, decryptBase64String, decodeBase64, box } from '../utils.js'
import JWTVerification from './verify-jwt.js'
import Agent from '../agent.js'

const { AUTH_SERVICE_SECRET_KEY, OAUTH_CREDENTIALS } = environment

const OAuthProviderCredentials = JSON.parse(OAUTH_CREDENTIALS)

export default function authenticateToken(domain, token, authority) {
  return new Promise( async (resolve, reject) => {
    if (authority === 'core') JWTVerification('core', token, resolve, reject)
    else if (!token || token.length < 32) resolve(anonymousProviderResponse(uuid())) //  the less than 32 is an indicator of token passed on logout TODO: make this exchange more explicit between client and server
    else {
      try {
        const { domain: tokenDomain, provider, code } = JSON.parse(await decryptBase64String(AUTH_SERVICE_SECRET_KEY, token))

        if (tokenDomain !== domain) reject(`INVALID TOKEN DOMAIN: ${domain} != ${tokenDomain}`)
        else if (provider === 'code') {
          //  TODO: authenticating user's provider should be the user id of the owner
          //  TODO: use code and providing user's config to get user id
          //  TODO: get user name from providing user (encrypted and decrypted w/ users's code)
          const id = uuid()
          resolve({
            user: id,
            provider_id: id,
            provider: 'providing user\'s id',
            info: { name: 'from providing user', picture: null }
          })
        }
        else if (OAuthProviderCredentials[provider.toUpperCase()]) JWTVerification(provider, code, resolve, reject)
        else {
          const { proofKey, senderKey, message } = JSON.parse(await decryptBase64String(AUTH_SERVICE_SECRET_KEY, code))
          const decryptedMessage = new TextDecoder().decode(decrypt(
            decodeBase64(proofKey),
            decodeBase64(senderKey),
            decodeBase64(message)
          ))

          const { user, created, name } = JSON.parse(decryptedMessage)
          const { credentials: [{ user_public_key }] } = await Agent.state(user)
          const { owner } = await Agent.metadata(user)

          if (user_public_key === senderKey && Date.now() - created < 30_000) {
            resolve({
              user,
              provider_id: user,
              provider: owner,
              info: { name, picture: null }
            })
          }
          else {
            reject('ERROR VERIFYING CODE')
          }
        }
      }
      catch (error) {
        console.warn(`ERROR DECRYPTING OR PARSING TOKEN FOR ${domain}`, error)
        reject('ERROR DECRYPTING OR PARSING TOKEN')
      }
    }
  })
}

function anonymousProviderResponse(id) {
  return {
    user: id,
    provider_id: id,
    provider: 'anonymous',
    info: { name: 'anonymous', picture: null }
  }
}

const decrypt = (mySecretKey, theirPublicKey, encryptedMessageBufferWithNonce) => {
  const nonce = encryptedMessageBufferWithNonce.slice(0, box.nonceLength)
  const encryptedMessageBuffer = encryptedMessageBufferWithNonce.slice(box.nonceLength)
  const decrypted = box.open(encryptedMessageBuffer, nonce, theirPublicKey, mySecretKey)

  if (!decrypted) throw new Error('Could not decrypt message')

  return decrypted
}
