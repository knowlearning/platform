// Global State - okay, as long as 'domain-config' scope handled at peristence.js layer

import { parseYAML, environment } from './utils.js'
import { getState } from './persistence.js'
import { download } from './storage.js'
import subscribe from './subscribe.js'
import domainAgent from './domain-agent/index.js'
import ADMIN_DOMAIN_CONFIG from './admin-domain-config.js'
import POSTGRES_DEFAULT_TABLES from './postgres-default-tables.js'
import SESSION from './session.js'
import { configCache as cache } from './stateful.js'
import {
  clearDomainStorageRoutes,
  normalizeStorageRoutes,
  setDomainStorageRoutes,
  storageRoutesFromConfiguration
} from './storage-routing.js'

const { ADMIN_DOMAIN } = environment
const DOMAIN_CONFIG_SCOPE = 'domain-config'

//  invalidate cached domain config on claim change
subscribe(DOMAIN_CONFIG_SCOPE, ({ patch: [{ path, value }] }) => {
  if (path[0] === 'active') {
    const domain = path[1]
    const hadCache = !!cache[domain]

    if (hadCache) console.log('invalidating cache...', domain)
    delete cache[domain]
    if (path.length === 2) {
      if (value?.storage) setDomainStorageRoutes(domain, value.storage)
      else clearDomainStorageRoutes(domain)
    }

    if (hadCache && path.length === 2 && value?.server !== SESSION) {
      domainAgent(domain, true)
    }
  }
})

export async function domainAdmin(domain) {
  //  the admin for X.localhost domains is always userid = X
  if (domain.endsWith('.localhost')) {
    const parts = domain.split('.')
    if (parts.length === 2) return parts[0]
  }

  const path = [`$.active["${domain}"]`]
  const res = await getState('core', DOMAIN_CONFIG_SCOPE, { path })
  if (res && res[0]) return res[0].admin
  else return null
}

export default async function configuration(domain, notifyIfNew) {
  if (domain === ADMIN_DOMAIN) cache[domain] = ADMIN_DOMAIN_CONFIG

  if (cache[domain]) return cache[domain]

  try {
    const path = [`$.active["${domain}"]`]
    const [domainConfig] = await getState('core', DOMAIN_CONFIG_SCOPE, { path })

    if (domainConfig) {
      const { admin, config } = domainConfig
      if (domainConfig.storage) {
        setDomainStorageRoutes(domain, normalizeStorageRoutes(domainConfig.storage))
      }

      if (config) cache[domain] = (await getState('core', config))?.active
      else cache[domain] = {}

      cache[domain].admin = admin
      cache[domain].id = config

      //  ensure domain has default postgres tables configured
      if (!cache[domain].postgres) cache[domain].postgres = {}
      if (!cache[domain].postgres.tables) cache[domain].postgres.tables = {}

      Object
        .assign(
          cache[domain].postgres.tables,
          POSTGRES_DEFAULT_TABLES
        )

      if (!domainConfig.storage) {
        setDomainStorageRoutes(domain, storageRoutesFromConfiguration(cache[domain]))
      }
    }
  }
  catch (error) { console.warn(error) }

  if (!cache[domain]) {
    cache[domain] = { admin: null, postgres: { tables: POSTGRES_DEFAULT_TABLES } }
    setDomainStorageRoutes(domain, storageRoutesFromConfiguration(cache[domain]))
  }

  return cache[domain]
}
