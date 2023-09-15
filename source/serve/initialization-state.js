export default function (domain, owner, name) {
  const now = Date.now()

  const initialState = {
    ii: 0,
    active_type: 'application/json',
    owner,
    domain,
    name,
    created: now,
    updated: now,
    active_size: 0,
    storage_size: 0
  }

  const initialPatch = [
    { op: 'add', path: [], value: initialState }
  ]

  return {
    ...initialState,
    history: [ initialPatch ]
  }
}