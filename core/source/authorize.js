import scopeToId from './scope-to-id.js'
import redis from './redis.js'
import configuration from './configuration.js'

export default function authorize(user, domain, scope, scopeUser, scopeDomain) {
  const id = await scopeToId(scopeDomain, scopeUser, scope)
  const md = await redis.client.json.get(id)

  const sameDomain = domain === md.domain
  const sameUser = user === md.user

  if (sameDomain && sameUser) return true
  else if (sameDomain) {
    const config = await configuration(domain)
    if (config?.authorize?.postgres) {
      // TODO: run the authorize function for postgres with user domain id variables
    }
    else return false
  }
  else if (!sameDomain) {
    //  TODO: return true if scopeDomain cross domain authorizer passes
    return false
  }
}