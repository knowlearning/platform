import { encryptSymmetric } from '../externals.js'
import interact from '../interact/index.js'
import * as hash from './hash.js'

const SESSION_TYPE = 'application/json;type=session'

export default async function saveSession(domain, session, sid, user_id, provider, info) {
  const [session_credential, sid_encrypted_info] = await Promise.all([
    hash.create(sid),
    encryptSymmetric(sid, JSON.stringify(info))
  ])
  const sessionPatch = [
    { op: 'add', value: SESSION_TYPE, path: ['active_type'] },
    {
      op: 'add',
      value: { session_credential, user_id, sid_encrypted_info, provider },
      path: ['active']
    }
  ]
  await interact(domain, user_id, session, sessionPatch)
}