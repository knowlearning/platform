import { jwt, jwkToPem, uuid, environment, decryptSymmetric } from '../externals.js'
import saveSession from './save-session.js'
import * as hash from './hash.js'
import interact from '../interact/index.js'
import { query } from '../postgres.js'
import { REATTACHING_SESSION_QUERY, NEW_SESSION_QUERY } from './queries.js'
import authenticateToken from './authenticate-token.js'

const { ADMIN_DOMAIN } = environment

const USER_TYPE = 'application/json;type=user'

async function decryptAndParseSessionInfo(key, encrypted) {
  try {
    return JSON.parse(await decryptSymmetric(key, encrypted))
  }
  catch (error) {
    console.warn(error)
    return {}
  }
}

export default async function authenticate(message, domain, sid) {
  const session_credential = await hash.create(sid)

  if (!message.token) {
    try {
      if (message.session) {
        //  find session to reattach to
        const { rows } = await query(domain, REATTACHING_SESSION_QUERY, [session_credential, message.session])
        //  TODO: throw error if no rows
        if (rows[0]) {
          return {
            user: rows[0].user_id,
            provider: rows[0].provider,
            session: message.session,
            info: await decryptAndParseSessionInfo(sid, rows[0].sid_encrypted_info)
          }
        }
      }

      const { rows } = await query(domain, NEW_SESSION_QUERY, [session_credential])
      if (rows[0]) {
        const user = rows[0].user_id
        const { provider, sid_encrypted_info } = rows[0]
        const info = await decryptAndParseSessionInfo(sid, sid_encrypted_info)
        const session = uuid()
        await saveSession(domain, session, sid, user, provider, info)
        return { user, provider, session, info }
      }
    }
    catch (error) { console.warn('error reconnecting session', domain, message, error) }
  }

  let authority

  if (message.token === 'anonymous' || message.token === 'anonymous-ephemeral') {
    authority = 'anonymous'
  }
  else if (domain === 'core') authority = 'core'
  else authority = 'JWT'

  const session = uuid()
  const { user, provider, provider_id, info } = await authenticateToken(domain, message.token, authority)
  console.log('NEW SESSION FOR USER', user, domain, session.slice(0, 4))

  const userPatch = [
    { op: 'add', value: USER_TYPE, path: ['active_type'] },
    { op: 'add', value: { provider_id, provider }, path: ['active'] }
  ]

  await interact(ADMIN_DOMAIN, 'users', user, userPatch)

  if (message.token !== 'anonymous-ephemeral') {
    //  TODO: consider leaving a record of the ephemeral user session, but
    //        just not associating with session_credential
    //        'anonymous-ephemeral' tokens are used in tests to create multiple agents in the
    //        same browser tab
    await saveSession(domain, session, sid, user, provider, info)
  }

  return { user, provider, session, info }
}
