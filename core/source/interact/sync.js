import * as postgres from '../postgres.js'
import * as redis from '../redis.js'
import configuration from '../configuration.js'

export default async function sync(domain, active_type, scope) {
  const config = await configuration(domain)
  const { tables } = config.postgres

  const tableNames = (
    Object
      .entries(tables)
      .filter(([_, info]) => active_type && info.type === active_type)
      .map(([name]) => name)
  )

  if (tableNames.length === 0) return syncMetadata(scope)

  const state = await redis.client.json.get(scope)

  if (!state) throw new Error(`TRYING TO ADD ROW FOR NON-EXISTENT SCOPE ${domain} ${table} ${id}`)

  await Promise.all(
    tableNames.map(async table => {
      const { columns } = config.postgres.tables[table]
      const [query, params] = postgres.setRow(domain, table, columns, scope, state)
      await postgres.query(domain, query, params)
    })
  )

  //  TODO: once we're sure the metadata table is set up, we can parallelize this sync
  //        with the above
  await syncMetadata(scope)
}

async function syncMetadata(scope) {
  const pathified = name => `$.${name}`
  const columns = ['active_type', 'domain', 'name', 'updated', 'created', 'owner', 'ii', 'active_size', 'storage_size']

  const values = await redis.client.json.get(scope, { path: columns.map(pathified) })

  const orderedValues = (
    columns
      .map(name => {
        const value = values[pathified(name)][0]
        return value === undefined ? null : value
      })
  )

  // use date format for created and updated
  orderedValues[3] = new Date(orderedValues[3])
  orderedValues[4] = new Date(orderedValues[4])

  const columnNames = columns.join(',')
  const query = `
    INSERT INTO
      metadata (id,${columnNames})
    VALUES
      ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
    ON CONFLICT(id)
      DO UPDATE SET
        (${columnNames}) = ROW ($2,$3,$4,$5,$6,$7,$8,$9,$10)
  `

  const domain = values[pathified('domain')][0]
  await postgres.query(domain, query, [scope, ...orderedValues])
}