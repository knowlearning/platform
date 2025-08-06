import { PatchProxy } from './utils.js'
import interact from './interact/index.js'
import { outstandingCoreStateInteractions as outstanding } from './stateful.js'

export default async function coreState(user, id, domain) {
  await interact(domain, user, id, [{ op: 'add', value: 'application/json', path: ['active_type'] }])
  return new PatchProxy({}, async patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    const done = interact(domain, user, id, patch)
    outstanding.add(done)
    done.finally(() => outstanding.delete(done))
  })
}

export function coreStateSynced() {
  return Promise.all(outstanding)
}