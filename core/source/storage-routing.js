import { storageRouteCache } from './stateful.js'

const DEFAULT_STORAGE_SERVER = 'default'
const STORAGE_KINDS = ['postgres', 'redis']

function serverNameFromConfig(kind, value) {
  if (value === undefined || value === null || value === '') return DEFAULT_STORAGE_SERVER
  if (typeof value === 'string') return value
  throw new Error(`${kind}.server must be a string`)
}

function normalizeStorageRoutes(routes={}) {
  return {
    postgres: serverNameFromConfig('postgres', routes.postgres),
    redis: serverNameFromConfig('redis', routes.redis)
  }
}

function storageRoutesFromConfiguration(config={}) {
  return normalizeStorageRoutes({
    postgres: config?.postgres?.server,
    redis: config?.redis?.server
  })
}

function setDomainStorageRoutes(domain, routes={}) {
  storageRouteCache[domain] = normalizeStorageRoutes(routes)
  return storageRouteCache[domain]
}

function clearDomainStorageRoutes(domain) {
  delete storageRouteCache[domain]
}

function storageServerForDomain(domain, kind) {
  if (!STORAGE_KINDS.includes(kind)) throw new Error(`Unknown storage kind "${kind}"`)
  return storageRouteCache[domain]?.[kind] || DEFAULT_STORAGE_SERVER
}

function storageRoutesForDomain(domain) {
  return normalizeStorageRoutes(storageRouteCache[domain])
}

export {
  DEFAULT_STORAGE_SERVER,
  normalizeStorageRoutes,
  storageRoutesFromConfiguration,
  setDomainStorageRoutes,
  clearDomainStorageRoutes,
  storageServerForDomain,
  storageRoutesForDomain
}
