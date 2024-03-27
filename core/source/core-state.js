import { PatchProxy } from './utils.js'
import interact from './interact/index.js'

export default async function coreState(user, id, domain) {
  await interact(domain, user, id, [{ op: 'add', value: 'application/json', path: ['active_type'] }])
  return new PatchProxy({}, async patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    interact(domain, user, id, patch)
  })
}
