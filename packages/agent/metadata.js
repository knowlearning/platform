import { validate as isUUID } from 'uuid'
import environment from './environment.js'

import resolveReference, { resolveUUIDReference } from './resolve-reference.js'

export default async function metadata(scope, user, domain) {
    const isUUIDOnlyReference = isUUID(scope) && !user && !domain
    if (isUUIDOnlyReference) {
        let existingReference = await resolveUUIDReference(scope)
        if (!existingReference) {
            const env = await environment()
            existingReference = {
                domain: env.domain,
                user: env.auth.user,
                scope: scope
            }
        }
        const { domain:d,  user:u, scope:s } = existingReference
        scope = s
        user = u
        domain = d
    }

    const id = await resolveReference(domain, user, scope)
    const { created, updated } = { created: Date.now(), updated: Date.now() }
    return {
      id,
      name: scope,
      owner: user,
      domain,
      created,
      updated,
      active_type: 'application/json', // TODO: resolve old scope types here
    }
}
