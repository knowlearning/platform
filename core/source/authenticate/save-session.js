import { encryptSymmetric } from '../utils.js'
import scopeToId from '../scope-to-id.js'
import { getState, patchState } from '../persistence.js'
import * as hash from './hash.js'
import { SESSION_OWNER, SESSION_TYPE } from './session-protection.js'

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
  // Bypass the client mutation path only here, after authentication succeeded.
  // Core owns the record; active.user_id remains the login identity.
  const id = await scopeToId(domain, SESSION_OWNER, session)
  const metadata = await getState(domain, id, { path: ['$.domain', '$.owner'] })
  if (metadata?.['$.domain']?.[0] !== domain || metadata?.['$.owner']?.[0] !== SESSION_OWNER) {
    throw new Error('INVALID AUTHENTICATION SESSION OWNER')
  }
  await patchState(domain, SESSION_OWNER, [], id, sessionPatch, Date.now(), session)
}
