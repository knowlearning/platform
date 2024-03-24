export { standardJSONPatch } from './utils.js'

const proxies = new Set()
const parentPaths = new Map()

// TODO: make serialization more reliable... basically: handle if prop includes "
//       ephemeral paths must be supplied like [['path', 1], ['another', 'deep', 'path']]
function serializePath(path) {
  return `/${path.join('/')}`
}

function copy(value) {
  return JSON.parse(JSON.stringify(value)) //  TODO: more efficient sanitization
}

export default function PatchProxy(state, interact, ephemeralPaths={}, parentPath=[], rootState) {
  if (ephemeralPaths[serializePath(parentPath)]) return state
  if (!rootState) rootState = state
  if (proxies.has(state)) {
    //  TODO: simply return with no effect if redundantly setting state like a[x] = a[x]
    throw new Error(`Cannot add mutable state to multiple mutable parents. Attempted Path: ${serializePath(parentPath)}`)
  }

  const isArray = Array.isArray(state)

  const childPatchProxy = (prop, value) => PatchProxy(
    value,
    interact,
    ephemeralPaths,
    [...parentPath, prop],
    rootState
  )

  const arrayShims = {
    copyWithin() {
      throw new Error ('"copyWithin" not implemented.')
    },
    sort(fn) {
      const originalIndexMap = new Map()

      state
        .forEach((value, index) => {
          if (!originalIndexMap.has(value)) originalIndexMap.set(value, [])
          originalIndexMap.get(value).push(index)
        })

      state.sort(fn)

      let sourceIndexes = state.map(value => originalIndexMap.get(value).shift())

      interact(
        state.map((value, sortedIndex) => {
          const pp = parentPaths.get(value)
          if (pp) pp[pp.length - 1] = sortedIndex

          const sourceIndex = sourceIndexes[sortedIndex]
          sourceIndexes = sourceIndexes.map(i => i<sourceIndex ? i+1 : i)

          return {
            op: 'move',
            from: [ ...parentPath, sourceIndex ],
            path: [ ...parentPath, sortedIndex ]
          }
        })
      )

      return proxy
    },
    reverse() {
      const patches = []

      state
        .forEach((value, index) => {
          patches.push({
            op: 'move',
            from: [...parentPath, index],
            path: [...parentPath, 0]
          })
          const pp = parentPaths.get(value)
          if (pp) pp[pp.length - 1] = state.length - 1 - index
        })

      state.reverse()
      interact(patches)
      return proxy
    },
    shift() {
      return arrayShims.splice(0, 1)[0]
    },
    unshift() {
      arrayShims.splice(0,0,...arguments)
      return state.length
    },
    splice(start, deleteCount, ...insertItems) {
      const path = [...parentPath, start]
      const patch = Array.from(
        { length: deleteCount },
        () => ({ op: 'remove', path })
      )

      insertItems.forEach((value, index) => {
        patch.push({
          op: 'add',
          path: [...parentPath, start + index],
          value: copy(value)
        })
      })

      const offset = insertItems.length - deleteCount
      if (offset !== 0) {
        state
          .slice(start + deleteCount)
          .forEach(value => {
            const pp = parentPaths.get(value)
            if (pp) pp[pp.length - 1] = pp[pp.length - 1] + offset
          })
      }

      const children = [...insertItems].map((value, index) => {
        return value instanceof Object ? childPatchProxy(index + start, value) : value
      })

      const removedItems = state.splice(start, deleteCount, ...children)

      interact(patch)

      return removedItems
    }
  }

  //  recursively ensure child objects are converted to proxies (unless they are in an ephemeral path)
  Object
    .entries(state)
    .filter(([, value]) => value instanceof Object)
    .forEach(([key, value]) => {
      if (isArray && /^\d+$/.test(key)) key = parseInt(key)
      state[key] = childPatchProxy(key, value)
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
        throw new Error(`Setting properties to undefined is not supported. Please use a delete statement. Attempted to set ${serializedPath}`)
      }

      interact([{
        op: target[prop] === undefined ? 'add' : 'replace',
        value: copy(value), //  TODO: more efficient sanitization
        path
      }])

      if (value instanceof Object) target[prop] = childPatchProxy(prop, value)
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
    },
    get(target, prop, receiver) {
      return isArray && arrayShims[prop] ? arrayShims[prop] : target[prop]
    }
  }

  const proxy = new Proxy(state, traps)

  proxies.add(proxy)
  parentPaths.set(proxy, parentPath)

  return proxy
}