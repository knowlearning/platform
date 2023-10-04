import MutableProxy from '../../../persistence/json.js'

//  TODO: consider path serialization approach. Also consider just using a mutable proxy from agent.state...

const copy = x => JSON.parse(JSON.stringify(x))

async function scopeIsUninitialized(scope) {
  // TODO: better check
  return Object.keys(await Agent.state(scope)).length === 0
}

export default async function (storeDefinition, scope) {
  let state = copy(await Agent.state(scope))
  const scopedPaths = getScopedPaths(storeDefinition)
  const stateAttachedStore = await attachModuleState(state, storeDefinition, scopedPaths)
  const s = stateAttachedStore.state
  const originalState = s instanceof Function ? s() : s

  const handlePatch = patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    return Agent.interact(scope, patch)
  }

  if (await scopeIsUninitialized(scope)) {
    state = copy(originalState)
    handlePatch([{ op: 'add', path: [], value: state }])
  }
  // ephemeral paths for the root mutable proxy are any paths with a scope specified (including null scopes)
  const ephemeralPaths = {}
  Object.keys(scopedPaths).forEach(key => ephemeralPaths[key] = true)

  stateAttachedStore.state = () => MutableProxy(state, handlePatch, ephemeralPaths)
  return stateAttachedStore
}

// TODO: sanitize module names for path serialization approach
function descendantPaths(path, pathSet) {
  return (
    Object
      .keys(pathSet)
      .filter(p => p.startsWith(path + '/')) // filter for descendant paths
      .reduce((acc, p) => {
        const descendantPart = p.slice(path.length)
        acc[descendantPart] = pathSet[p]
        return acc
      }, {})
  )
}

async function attachModuleState(state, module, scopedPaths, path='') {
  await Promise.all(
    Object
      .entries(module.modules || {})
      .map(async ([subModuleName, subModule]) => {
        const subModuleStartState = state ? state[subModuleName] : null

        // vuex expects to initialize state from submodules
        if (subModuleStartState) delete state[subModuleName]

        module.modules[subModuleName] = await attachModuleState(subModuleStartState, subModule, scopedPaths, `${path}/${subModuleName}`)
      })
  )

  // if our path is in scoped paths, return new Mutable proxy attached to scope
  const scope = scopedPaths[path]
  if (scope) {
    const handlePatch = patch => {
      patch.forEach(({ path }) => path.unshift('active'))
      return Agent.interact(scope, patch)
    }
    const initState = await Agent.state(scope)
    const ephemeralPaths = descendantPaths(path, scopedPaths)
    state = MutableProxy(copy(initState), handlePatch, ephemeralPaths)
    if (await scopeIsUninitialized(scope)) {
      Object.assign(state, module.state instanceof Function ? module.state() : module.state)
    }
    return { ...module, state: () => state }
  }
  //  TODO: better check for initialized state
  else return Object.keys(state).length ? { ...module, state: () => state } : module
}

function getScopedPaths(module, path="", paths={}) {
  if (module.scope !== undefined) paths[path] = module.scope

  Object
    .entries(module.modules || {})
    .forEach(([subModuleName, subModule]) => {
      getScopedPaths(subModule, `${path}/${subModuleName}`, paths)
    })

  return paths
}
