import { getState, patchState } from './persistence.js'
import scopeToId from './scope-to-id.js'
import { environment } from './utils.js'
import { assertSessionPatchAllowed } from './authenticate/session-protection.js'

const { ADMIN_DOMAIN } = environment

function canPatchForeignState(domain, user) {
  return domain === ADMIN_DOMAIN && environment.SUPER_ADMINS.includes(user)
}

export async function assertInteractionAllowed(domain, user, id, patch) {
  const info = await getState(domain, id, { path: ['$.domain', '$.owner', '$.active_type'] })

  assertSessionPatchAllowed(patch, {
    active_type: info?.['$.active_type']?.[0]
  })

  if (
    info !== null
    && (domain !== info?.['$.domain'][0] || user !== info?.['$.owner'][0])
    && !canPatchForeignState(domain, user)
  ) {
    console.log('DOMAIN OR USER MISMATCH FOR PATCH', info, domain, user, id, patch)
    throw new Error('DOMAIN OR USER MISMATCH FOR PATCH')
  }
}

export default async function interact( domain, user, scope, patch, context=[], timestamp=Date.now() ) {
  const id = domain === 'core' && user === 'core' ? scope : await scopeToId(domain, user, scope)
  await assertInteractionAllowed(domain, user, id, patch)

  try {
    const { ii, type } = await patchState(domain, user, context, id, patch, timestamp, scope)
    return { ii, active_type: type }
  }
  catch (error) {
    console.log('ERROR EXECUTING TRANSACTION')
    console.log(error)
    console.log(domain, user, scope, timestamp, patch)
    return {}
  }
}
