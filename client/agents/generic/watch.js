import { validate as isUUID } from 'uuid'

export default function({ metadata, state, watchers, synced }) {

  function watch(scope=DEFAULT_SCOPE_NAME, fn, user, domain) {
    if (Array.isArray(scope)) return watchResolution(scope, fn, user, domain)

    const statePromise = state(scope, user, domain)
    const qualifiedScope = isUUID(scope) ? scope : `${domain || ''}/${user || ''}/${scope}`

    metadata(scope, user, domain)
      .then(async ({ ii }) => {
        fn({
          scope,
          user,
          domain,
          state: await statePromise,
          patch: null,
          ii
        })
        if (!watchers[qualifiedScope]) watchers[qualifiedScope] = []
        watchers[qualifiedScope].push(fn)
      })

    return () => removeWatcher(qualifiedScope, fn)
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