//  TODO: actually put this in side-effect pipeline instead of one-off import in handle-ws.js

import * as postgres from '../postgres.js'
import * as redis from '../redis.js'
import configuration from '../configuration.js'

export default async function (domain, active_type, scope) {
  const config = await configuration(domain)
  if (!config || !config.postgres) return

  const { tables } = config.postgres

  const tableNames = (
    Object
      .entries(tables)
      .filter(([_, info]) => info.type === active_type)
      .map(([name]) => name)
  )

  if (tableNames.length === 0) return

  const state = await redis.client.json.get(scope)

  if (!state) throw new Error(`TRYING TO ADD ROW FOR NON-EXISTENT SCOPE ${domain} ${table} ${id}`)

  await Promise.all(
    tableNames.map(async table => {
      const { columns } = config.postgres.tables[table]
      const [query, params] = postgres.setRow(domain, table, columns, scope, state)
      await postgres.query(domain, query, params)
    })
  )
}