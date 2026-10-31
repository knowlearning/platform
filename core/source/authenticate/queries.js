import { SESSION_OWNER, SESSION_TYPE } from './session-protection.js'

// Legacy sessions keep their user owner. The mutation guard prevents clients
// from changing these records or creating new records of the session type.
const REATTACHING_SESSION_QUERY = `
  SELECT
    sessions.id as id,
    user_id,
    provider,
    sid_encrypted_info,
    created
  FROM sessions
  JOIN metadata
    ON metadata.id = sessions.id
  WHERE session_credential = $1
    AND sessions.id = $2
    AND (metadata.owner = '${SESSION_OWNER}' OR metadata.owner = sessions.user_id)
    AND metadata.active_type = '${SESSION_TYPE}'
  ORDER BY created DESC LIMIT 1
`

const NEW_SESSION_QUERY = `
  SELECT
    user_id,
    provider,
    sid_encrypted_info,
    created
  FROM sessions
  JOIN metadata
    ON metadata.id = sessions.id
  WHERE session_credential = $1
    AND (metadata.owner = '${SESSION_OWNER}' OR metadata.owner = sessions.user_id)
    AND metadata.active_type = '${SESSION_TYPE}'
  ORDER BY created DESC LIMIT 1
`

export {
  NEW_SESSION_QUERY,
  REATTACHING_SESSION_QUERY
}
