import * as postgres from '../postgres.js'
import * as redis from '../redis.js'
import configuration from '../configuration.js'

const { ADMIN_DOMAIN } = process.env

export default async function (scope) {
  if (scope === 'claims') return // TODO: remove use of special claims scope and use postgres for ADMIN_DOMAIN

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
  const rowValues = '$2,$3,$4,$5,$6,$7,$8,$9,$10'
  const query = `
    INSERT INTO
      metadata (id,${columnNames})
    VALUES
      ($1,${rowValues})
    ON CONFLICT(id)
      DO UPDATE SET
        (${columnNames}) = ROW (${rowValues})
  `
  const insertMetadataQuery = d => postgres.query(d, query, [scope, ...orderedValues])

  const queries = [insertMetadataQuery(ADMIN_DOMAIN)]

  const domain = values[pathified('domain')][0]
  const domainConfig = await configuration(domain)
  if (domainConfig.postgres) queries.push(insertMetadataQuery(domain))

  await Promise.all(queries)
}