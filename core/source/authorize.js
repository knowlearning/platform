import * as redis from './redis.js'
import configuration from './configuration.js'
import * as postgres from './postgres.js'

export default async function authorize(requestingUser, requestingDomain, scope) {
  const md = await redis.client.json.get(scope)
  const { owner: targetUser, domain: targetDomain } = md

  const sameDomain = requestingDomain === targetDomain
  const sameUser = requestingUser === targetUser

  if (sameDomain && sameUser) return true
  else if (sameDomain) {
    const config = await configuration(requestingDomain)
    if (config?.authorize?.postgres) {
      const result = await postgres.query(targetDomain, `SELECT ${postgres.purifiedName(config.authorize.postgres)}($1, $2) AS result`, [requestingUser, scope], true)
      // TODO: run the authorize function for postgres with
      //       requestingUser and scope variables
      console.log('result from test query!!!!!!!!!!!!!!!!!!!!!!!!!!!!!', result)
      return true
    }
  }
  else {
    const config = await configuration(targetDomain)
    if (config?.authorize?.crossDomain?.postgres) {
      // TODO: run the authorize function for postgres with
      //       requestingUser, requestingDomain, and scope
      //       variables
    }
  }

  console.log('WE WILL BE RETURNING FAAAAAAAALSEEEEEEEEEEEEEEEEEEEE!!!!!!!!!! from here...')
  return true
}