import { validate as isUUID } from 'uuid'

const DEFAULT_SCOPE_NAME = '[]'

export default function({ metadata, environment, state, watchers, synced, sentUpdates }) {

  function watch(scope=DEFAULT_SCOPE_NAME, fn, user, domain) {
    if (Array.isArray(scope)) return watchResolution(scope, fn, user, domain)

    const statePromise = state(scope, user, domain)

    let qualifiedScope
    let removed = false
    metadata(scope, user, domain)
      .then(async ({ ii }) => {
        if (removed) return

        const { auth: { user: u }, domain: d } = await environment()
        qualifiedScope = isUUID(scope) ? scope : `${!domain || domain === d ? '' : domain}/${!user || user === u ? '' : user}/${scope}`

        fn({
          scope,
          user,
          domain,
          state: await statePromise,
          patch: null,
          ii
        })

        if (sentUpdates) sentUpdates[qualifiedScope] = ii

        if (removed) return

        if (!watchers[qualifiedScope]) watchers[qualifiedScope] = []
        watchers[qualifiedScope].push(fn)
      })

    return () => {
      removed = true
      return removeWatcher(qualifiedScope, fn)
    }
  }

  function watchResolution(path, callback, user, domain) {
    const id = path[0]
    const references = path.slice(1)
    let unwatchDeeper = () => {}

    const watchCallback = ({ state }) => {
      if (references.length === 0) {
        callback(state)
        return
      }

      //  TODO: check if value we care about actually changed
      //        and ignore this update if it has not.
      unwatchDeeper()

      let value = state
      for (let index = 0; index < references.length; index += 1) {
        value = value[references[index]]
        if (
          value === null ||
          value === undefined ||
          index === references.length - 1
        ) callback(value)
        else if (isUUID(value)) {
          unwatchDeeper = watchResolution([value, ...references.slice(index + 1)], callback, user, domain)
          return
        }
      }
    }

    const unwatch = watch(id, watchCallback, user, domain)

    return () => {
      unwatch()
      unwatchDeeper()
    }
  }

  function removeWatcher(key, fn) {
    const watcherIndex = watchers[key].findIndex(x => x === fn)
    if (watcherIndex > -1) watchers[key].splice(watcherIndex, 1)
    else console.warn('TRIED TO REMOVE WATCHER THAT DOES NOT EXIST')
  }

  return [ watch, removeWatcher ]

}