import { validate as isUUID } from 'uuid'
import environment from './environment.js'
import * as messageQueue from './message-queue.js'
import { watch } from './synchronization.js'
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
    return new Promise(resolve => {
      const unwatch = watch(id, ({ metadata }) => {
         unwatch()
         //  TODO: deprecate active_type...
         metadata.active_type = metadata.type
         delete metadata.type
         resolve(metadata)
      })
    })
}
