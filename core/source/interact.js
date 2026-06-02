import { getState, patchState } from './persistence.js'
import scopeToId from './scope-to-id.js'
import { environment } from './utils.js'

const { ADMIN_DOMAIN } = environment

function canPatchForeignState(domain, user) {
  return domain === ADMIN_DOMAIN && environment.SUPER_ADMINS.includes(user)
}

export default async function interact( domain, user, scope, patch, context=[], timestamp=Date.now() ) {
  //  TODO: validate that patch's paths can only start with "active", "active_type", or "name"

  const id = domain === 'core' && user === 'core' ? scope : await scopeToId(domain, user, scope)
  const info = await getState(domain, id, { path: ['$.domain', '$.owner' ]})

  if (
    info !== null
    && (domain !== info?.['$.domain'][0] || user !== info?.['$.owner'][0])
    && !canPatchForeignState(domain, user)
  ) {
    console.log('DOMAIN OR USER MISMATCH FOR PATCH', info, domain, user, scope, patch)
    throw new Error('DOMAIN OR USER MISMATCH FOR PATCH')
  }

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
