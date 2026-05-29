import PatchProxy from '@knowlearning/patch-proxy'

const copy = value => JSON.parse(JSON.stringify(value))

function currentAgent() {
  const agent = globalThis.__embeddedHarnessCurrentAgent
  if (!agent) throw new Error('No embedded harness Agent is active')
  return agent
}

async function scopeIsUninitialized(scope) {
  return Object.keys(await currentAgent().state(scope)).length === 0
}

function descendantPaths(path, pathSet) {
  return (
    Object
      .keys(pathSet)
      .filter(p => p.startsWith(path + '/'))
      .reduce((acc, p) => {
        const descendantPart = p.slice(path.length)
        acc[descendantPart] = pathSet[p]
        return acc
      }, {})
  )
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

function removePath(target, path) {
  const parts = path.split('/').filter(Boolean)
  if (!parts.length) return

  let parent = target
  for (const part of parts.slice(0, -1)) {
    if (!parent || typeof parent !== 'object') return
    parent = parent[part]
  }

  if (parent && typeof parent === 'object') delete parent[parts[parts.length - 1]]
}

function stripScopedState(state, scopedPaths) {
  const stripped = copy(state)
  Object
    .keys(scopedPaths)
    .sort((a, b) => a.split('/').length - b.split('/').length)
    .forEach(path => removePath(stripped, path))
  return stripped
}

async function attachModuleState(state, module, scopedPaths, path='') {
  await Promise.all(
    Object
      .entries(module.modules || {})
      .map(async ([subModuleName, subModule]) => {
        const subModuleStartState = state ? state[subModuleName] : null
        if (subModuleStartState) delete state[subModuleName]

        module.modules[subModuleName] = await attachModuleState(
          subModuleStartState,
          subModule,
          scopedPaths,
          `${path}/${subModuleName}`
        )
      })
  )

  const scope = scopedPaths[path]
  if (scope) {
    const Agent = currentAgent()
    const handlePatch = patch => {
      patch.forEach(({ path }) => path.unshift('active'))
      return Agent.interact(scope, patch)
    }
    const initState = await Agent.state(scope)
    const ephemeralPaths = descendantPaths(path, scopedPaths)
    state = PatchProxy(copy(initState), handlePatch, ephemeralPaths)
    if (await scopeIsUninitialized(scope)) {
      Object.assign(state, module.state instanceof Function ? module.state() : module.state)
    }
    return { ...module, state: () => state }
  }

  return state && Object.keys(state).length ? { ...module, state: () => state } : module
}

export async function vuePersistentStore(storeDefinition, scope) {
  const Agent = currentAgent()
  let state = copy(await Agent.state(scope))
  const scopedPaths = getScopedPaths(storeDefinition)
  const stateAttachedStore = await attachModuleState(state, storeDefinition, scopedPaths)
  const s = stateAttachedStore.state
  const originalState = s instanceof Function ? s() : s
  const persistentInitialState = stripScopedState(originalState, scopedPaths)

  const handlePatch = patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    return Agent.interact(scope, patch)
  }

  if (await scopeIsUninitialized(scope)) {
    state = persistentInitialState
    handlePatch([{ op: 'add', path: [], value: state }])
  }

  const ephemeralPaths = {}
  Object.keys(scopedPaths).forEach(key => {
    ephemeralPaths[key] = true
  })

  stateAttachedStore.state = () => PatchProxy(state, handlePatch, ephemeralPaths)
  return stateAttachedStore
}

function startEmbedding(target, props) {
  let iframe
  let embedding

  const attach = id => {
    if (!id) return

    embedding?.remove()
    if (iframe?.parentNode) iframe.parentNode.removeChild(iframe)

    iframe = document.createElement('iframe')
    iframe.style = `
      width: 100%;
      height: 100%;
      border: none;
    `

    target.appendChild(iframe)

    const Agent = currentAgent()
    embedding = Agent.embed({
      id,
      mode: props.mode,
      namespace: props.namespace
    }, iframe)

    embedding.on('environment', user => {
      if (props.environmentProxy) return props.environmentProxy(user)
      return currentAgent().environment(user)
    })
    embedding.on('state', event => props.onState?.(event))
    embedding.on('mutate', event => props.onMutate?.(event))
    embedding.on('close', event => props.onClose?.(event))
  }

  let stopWatching
  if (props.path?.length) stopWatching = currentAgent().watch([props.id, ...props.path], attach)
  else attach(props.id)

  return {
    unmount() {
      stopWatching?.()
      embedding?.remove()
      if (iframe?.parentNode) iframe.parentNode.removeChild(iframe)
    }
  }
}

export const vueEmbedComponent = {
  mount(target, props) {
    return startEmbedding(target, props)
  }
}
