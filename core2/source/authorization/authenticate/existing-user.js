import { environment } from '../externals.js'
import { query } from '../postgres.js'

const { ADMIN_DOMAIN } = environment

const EXISTING_USER_QUERY = `
  SELECT u.id
  FROM users u
  JOIN metadata m ON m.id = u.id
  WHERE u.provider = $1
    AND u.provider_id = $2
  ORDER BY m.created ASC LIMIT 1
`
export default async function getExistingUser(provider, provider_id) {
  const { rows: [ existingUser ]} = await query(
    ADMIN_DOMAIN,
    EXISTING_USER_QUERY,
    [provider, provider_id]
  )
  return existingUser
}