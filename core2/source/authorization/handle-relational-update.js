import { decodeNATSSubject, decodeJSON } from './externals.js'
import * as postgres from './postgres.js'
import postgresDefaultTables from './postgres-default-tables.js'
import Agent from './agent/deno/deno.js'
import { jsm } from './nats.js'

export default async function handleRelationalUpdate(message) {
  const { subject, data } = message

  const [domain, user, name] = decodeNATSSubject(subject.substring(subject.indexOf('.') + 1))
  if (domain === 'core') return

  const  id = await jsm.streams.find(subject.substring(subject.indexOf('.') + 1))

  const patch = decodeJSON(data)
  const metadataPatch = patch.filter(op => op.metadata)

  if (metadataPatch.length) {
    const columnValues = {}

    metadataPatch.forEach(({ op, path, value }) => {
      if (op === 'add' || op === 'replace') {
        if (path.length === 0) {
          Object.assign(columnValues, value)
        }
        else if (path.length === 1) {
          columnValues[path[0]] = value
        }
      }
      else if (op === 'remove') {
        if (path.length === 1) {
          columnValues[path[0]] = null
        }
      }
    })

    console.log('METADATA UPDATES', metadataPatch)
    await Agent
      .metadata(id)
      .then(async metadata => {
        const { columns } = postgresDefaultTables.metadata
        const [statement, args] = postgres.setRow(domain, 'metadata', columns, id, {...metadata, domain, user, name, id})
        await
          postgres
            .query(domain, statement, args)
            .catch(async error => {
              if (error.fields.code === '42P01') { // table not set up
                //  TODO: share code with authorization server configure script...
                const { columns, indices } = postgresDefaultTables.metadata
                await postgres.createTable(domain, 'metadata', columns)
                await Promise.all(
                  Object
                    .entries(indices)
                    .map(([name, { column }]) => {
                      return postgres.createIndex(domain, name, 'metadata', column)
                    })
                )
                return postgres.query(domain, statement, args)
              }
              else throw error
            })
      })
  }

  await Agent
    .metadata(id)
    .then(async metadata => {
      await
        Agent
          .state(domain, 'core', 'core')
          .then(async ({ configuration }) => {
            //  TODO: watch instead of fetch
            const typeToTable = (
              Object
                .entries(configuration?.postgres?.tables || {})
                .reduce((prev, [name, { type, columns, indices }]) => {
                  prev[type] = { name, columns, indices }
                  return prev
                }, {})
            )
            const relevantTableConfig = typeToTable[metadata.active_type]
            if (relevantTableConfig) {
              const { name, columns } = relevantTableConfig
              await Promise.all(
                decodeJSON(message.data)
                  .filter(({ metadata, path }) => {
                    //  TODO: handle deep set into columns of type JSON
                    if (metadata || path.length > 1) return
                    return columns[path[0]]
                  })
                  .map(async ({ op, path, value }) => {
                    if (path.length === 0) {
                      const data = op === 'add' || op === 'replace' ? value : {}
                      const [statement, params] = postgres.setRow(domain, name, columns, id, { ...value, id })
                      postgres.query(domain, statement, params)
                    }
                    else {
                      const data = op === 'add' || op === 'replace' ? value : null
                      await postgres.setColumn(domain, name, path[0], id, data)
                    }
                  })
              )
            }
          })
    })
}
