import { parse as parseYAML } from 'yaml'
import * as redis from './redis.js'
import { download } from './storage.js'
import subscribe from './subscribe.js'
import ADMIN_DOMAIN_CONFIG from './admin-domain-config.js'
import POSTGRES_DEFAULT_TABLES from './postgres-default-tables.js'

const { ADMIN_DOMAIN } = process.env
const DOMAIN_CONFIG_SCOPE = 'domain-config'

const cache = {}

//  invalidate cached domain config on claim change
subscribe(DOMAIN_CONFIG_SCOPE, ({ patch: [{ path }] }) => {
  const domain = path[1]
  console.log('invalidating cache...', domain, path)
  delete cache[domain]
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

export default async function configuration(domain) {
  if (domain === ADMIN_DOMAIN) return ADMIN_DOMAIN_CONFIG

  if (cache[domain]) return cache[domain]

  await redis.connected

  try {
    const path = [`$.active["${domain}"]`]
    const [domainConfig] = await redis.client.json.get('domain-config', { path })

    if (domainConfig) {
      const { admin, config } = domainConfig
      if (config) {
        const url = await download(config, 3, true)
        const response = await fetch(url)

        if (response.status !== 200) {
          const text = await response.text()
          throw new Error(text)
        }

        cache[domain] = parseYAML(await response.text())
      }
      else cache[domain] = {}

      cache[domain].admin = admin

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
