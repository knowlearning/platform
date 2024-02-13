import { encryptSymmetric } from '../utils.js'
import interact from '../interact/index.js'

const SESSION_TYPE = 'application/json;type=session'

export default async function saveSession(domain, session, sid, session_credential, user, provider, info) {
  const sessionPatch = [
    { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
    {
      op: 'add',
      value: {
        session_credential,
        user_id: user,
        sid_encrypted_info: await encryptSymmetric(sid, JSON.stringify(info)),
        provider
      },
      path: ['active']
    }
  ]
  await interact(domain, user, session, sessionPatch)
}