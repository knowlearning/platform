const proxies = new Set()

// TODO make serialization more reliable... basically: handle if prop includes "
function serializePath(path) {
  return `/${path.join('/')}`
}

//  TODO: add extra argument for "ignorePrefixes" to ignore interactions at certain paths
export default function MutableProxy(state, interact, ephemeralPaths={}, parentPath=[], rootState) {
  if (ephemeralPaths[serializePath(parentPath)]) return state
  if (!rootState) rootState = state
  if (proxies.has(state)) {
    //  TODO: simply return with no effect if redundantly setting state like a[x] = a[x]
    throw new Error(`Cannot add mutable state to multiple mutable parents. Attempted Path: ${serializePath(parentPath)}`)
  }

  const isArray = Array.isArray(state)

  const childMutableProxy = (prop, value) => MutableProxy(
    value,
    interact,
    ephemeralPaths,
    [...parentPath, prop],
    rootState
  )

  //  recursively ensure child objects are converted to proxies (unless they are in an ephemeral path)
  Object
    .entries(state)
    .filter(([, value]) => value instanceof Object)
    .forEach(([key, value]) => {
      if (isArray && /^\d+$/.test(key)) key = parseInt(key)
      state[key] = childMutableProxy(key, value)
    })

  const traps = {
    set(target, prop, value) {
      if (isArray) {
        if (!/^\d+$/.test(prop)) {
          target[prop] = value
          return true
        }
        else prop = parseInt(prop)
      }

      const path = [...parentPath, prop]
      const serializedPath = serializePath(path)

      if (ephemeralPaths[serializedPath]) {
        target[prop] = value
        return true
      }

      if (value === undefined) {
        console.log('EXTRA ERROR INFO. target, prop, value', target, prop, value)
        throw new Error(`Setting properties to undefined is not supported. Please use a delete statement. Attempted to set ${serializedPath}`)
      }

      //  TODO: probably want to batch interactions that represent array mutations... and/or do
      //        something smart around insertions/deletions
      //  TODO: if is array and prop is last element, consider passing -1 as prop
      interact([{
        op: target[prop] === undefined ? 'add' : 'replace',
        value: JSON.parse(JSON.stringify(value)), //  TODO: more efficient sanitization
        path
      }])

      if (value instanceof Object) target[prop] = childMutableProxy(prop, value)
      else target[prop] = value

      return true
    },
    deleteProperty(target, prop) {
      if (prop in target) {
        proxies.delete(proxy)
        delete target[prop]

        if (isArray) {
          if (!/^\d+$/.test(prop)) return true
          else prop = parseInt(prop)
        }

        //  TODO: if is array and prop is last element, consider passing -1 as prop
        const path = [...parentPath, prop]
        if (!ephemeralPaths[serializePath(path)]) interact([{ op: 'remove', path }])
      }
      return true
    }
  }

  const proxy = new Proxy(state, traps)
  proxies.add(proxy)

  return proxy
}