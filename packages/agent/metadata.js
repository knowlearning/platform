import { validate as isUUID } from 'uuid'
import PatchProxy from '@knowlearning/patch-proxy'
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
        owner: env.auth.user,
        name: scope
      }
    }
    const { domain:d, owner, name } = existingReference
    scope = name
    user = owner
    domain = d
  }
  else if (!user || !domain) {
    const env  = await environment()
    if (!user) user = env.auth.user
    if (!domain) domain = env.domain
  }

  const id = await resolveReference(domain, user, scope)
  return new Promise(resolve => {
    const unwatch = watch(id, ({ metadata }) => {
    unwatch()
      //  TODO: deprecate active_type...
      metadata.active_type = metadata.type
      delete metadata.type
      resolve(
        new PatchProxy(metadata, patch => {
          if (!patch.every(isValidMetadataMutation)) {
            throw new Error("You may only modify the type or name for a scope's metadata")
          }
          patch.forEach(op => {
            op.metadata = true
            op.path = ['type'] //  TODO: deprecate active_type and migrate to type being immutable and part of immutable name
          })
          messageQueue.publish(id, patch)
        })
      )
    })
  })
}

function isValidMetadataMutation({ path, op, value }) {
  return (
    path[0] === 'active_type'
    && path.length === 1
    && typeof value === 'string' || op === 'remove'
  )
}
