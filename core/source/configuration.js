import { parseYAML, environment } from './utils.js';
import * as redis from './redis.js'
import { download } from './storage.js'
import subscribe from './subscribe.js'
import domainAgent from './domain-agent/index.js'
import ADMIN_DOMAIN_CONFIG from './admin-domain-config.js'
import POSTGRES_DEFAULT_TABLES from './postgres-default-tables.js'
import SESSION from './session.js'
import { configCache as cache } from './stateful.js'

const { ADMIN_DOMAIN } = environment
const DOMAIN_CONFIG_SCOPE = 'domain-config'

//  invalidate cached domain config on claim change
subscribe(DOMAIN_CONFIG_SCOPE, ({ patch: [{ path, value }] }) => {
  if (path[0] === 'active' && cache[path[1]]) {
    const domain = path[1]
    console.log('invalidating cache...', domain)

    delete cache[domain]
    if (value?.server !== SESSION) {
      console.log('UPDATING DOMAIN AGENT', value, path)
      domainAgent(domain, true)
    }
  }
})

export async function domainAdmin(domain) {
  await redis.connected

  //  the admin for X.localhost domains is always userid = X
  if (domain.endsWith('.localhost')) {
    const parts = domain.split('.')
    if (parts.length === 2) return parts[0]
  }

  const path = [`$.active["${domain}"]`]
  const res = await redis.client.json.get(DOMAIN_CONFIG_SCOPE, { path })
  if (res && res[0]) return res[0].admin
  else return null
}

export default async function configuration(domain, notifyIfNew) {
  if (domain === ADMIN_DOMAIN) cache[domain] = ADMIN_DOMAIN_CONFIG

  if (cache[domain]) return cache[domain]

  await redis.connected

  try {
    const path = [`$.active["${domain}"]`]
    const [domainConfig] = await redis.client.json.get(DOMAIN_CONFIG_SCOPE, { path })

    if (domainConfig) {
      const { admin, config } = domainConfig
      if (config) {
        const stateConfig = (await redis.client.json.get(config))?.active
        if (stateConfig?.deployment) cache[domain] = stateConfig
        else {
          //  TODO: deprecate this fallback
          const url = await download(config, 3, true)
          const response = await fetch(url)

          if (response.status !== 200) {
            const text = await response.text()
            throw new Error(text)
          }

          cache[domain] = parseYAML(await response.text())
        }
      }
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
    }
  }
  catch (error) { console.warn(error) }

  if (!cache[domain]) cache[domain] = { admin: null, postgres: { tables: POSTGRES_DEFAULT_TABLES } }

  return cache[domain]
}
