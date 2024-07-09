import { uuid, environment, decryptBase64String } from '../utils.js'
import JWTVerification from './verify-jwt.js'
import OAuthClientInfo from './oauth-client-info.js'

const { AUTH_SERVICE_SECRET_KEY } = environment

export default function authenticateToken(domain, token, authority) {
  return new Promise( async (resolve, reject) => {
    if (authority === 'core') JWTVerification('core', token, resolve, reject)
    else if (!token || token.length < 32) resolve(anonymousProviderResponse(uuid())) //  the less than 32 is an indicator of token passed on logout TODO: make this exchange more explicit between client and server
    else {
      try {
        const { domain: tokenDomain, provider, code } = JSON.parse(await decryptBase64String(AUTH_SERVICE_SECRET_KEY, token))

        if (tokenDomain !== domain) reject(`INVALID TOKEN DOMAIN: ${domain} != ${tokenDomain}`)
        else if (OAuthClientInfo[provider]) JWTVerification(provider, code, resolve, reject)
        else resolve(anonymousProviderResponse(uuid()))
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
