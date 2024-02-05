import * as redis from './redis.js'
import configuration from './configuration.js'
import * as postgres from './postgres.js'

export default async function authorize(requestingUser, requestingDomain, requestedScope) {
  const { owner: targetUser, domain: targetDomain } = await redis.client.json.get(requestedScope)

  const sameDomain = requestingDomain === targetDomain
  const sameUser = requestingUser === targetUser

  if (sameDomain) {
    if (sameUser) return true
    else {
      const config = await configuration(requestingDomain)
      if (config?.authorize?.sameDomain?.postgres) {
        try {
          const query = `SELECT ${postgres.purifiedName(config.authorize.sameDomain.postgres)}($1, $2) AS result`
          const { rows: [{ result }] } = await postgres.query(targetDomain, query, [requestingUser, requestedScope], true)
          return result
        }
        catch (error) {
          console.warn('Error in same domain, cross user authorization', error)
          return false
        }
      }
    }
  }
  else {
    const config = await configuration(targetDomain)
    if (config?.authorize?.crossDomain?.postgres) {
      try {
        const query = `SELECT ${postgres.purifiedName(config.authorize.crossDomain.postgres)}($1, $2, $3) AS result`
        const { rows: [{ result }] } = await postgres.query(targetDomain, query, [requestingDomain, requestingUser, requestedScope], true)
        return result
      }
      catch (error) {
        console.warn('Error in cross domain authorization', error)
        return false
      }
    }
  }

  return false
}