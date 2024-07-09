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
  ORDER BY created DESC LIMIT 1
`

export {
  NEW_SESSION_QUERY,
  REATTACHING_SESSION_QUERY
}