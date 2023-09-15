import { v4 as uuid } from 'uuid'
import { domainAdmin } from '../configuration.js'
import * as redis from '../redis.js'
import * as postgres from '../postgres.js'
import { download } from '../storage.js'
import { parse as parseYAML } from 'yaml'
import interact from '../interact.js'
import POSTGRES_DEFAULT_TABLES from '../postgres-default-tables.js'
import MutableProxy from '../../lib/persistence/json.js'

//  TODO: probably want to abstract this and allow different types
//        to help with removing privaleged named states
function coreState(id, domain) {
  const user = 'core'
  interact(domain, user, id, [{ op: 'add', value: 'application/json', path: ['active_type'] }])
  return new MutableProxy({}, async patch => {
    patch.forEach(({ path }) => path.unshift('active'))
    interact(domain, user, id, patch)
  })
}

const MAX_PARAMS_IN_BATCH = 10_000

const { ADMIN_DOMAIN, MODE } = process.env

async function isAdmin(user, requestingDomain, requestedDomain) {
  return (
       (MODE === 'local' && requestingDomain.split(':')[0] === 'localhost')
    || requestingDomain === `${user}.localhost`
    || (requestingDomain === ADMIN_DOMAIN && user === await domainAdmin(requestedDomain))
  )
}

export default async function (domain, user, session, patch, si, ii, send) {
  console.log('TRYING TO CONFIG A DOMAIN')
  if (patch[0].path.length === 2 && await isAdmin(user, domain, patch[0].path[1])) {
    console.log('CONFIGURING DOMAIN!!!!!!!!!!!', patch)
    const { op, value: { config } } = patch[0]
    const [_, confDomain] = patch[0].path

    if (op === 'replace' || op === 'add') {
      await interact('core', 'core', 'domain-config', [
        { op: 'add', path: ['active', confDomain], value: { config, admin: user } }
      ])
      const url = await download(config, 3, true)
      const response = await fetch(url)
      if (response.status !== 200) {
        throw new Error('Error getting config')
      }

      const reportId = uuid()
      const report = coreState(reportId, domain)

      report.tasks = {}
      report.start = Date.now()
      const configuration = parseYAML(await response.text())
      await applyConfiguration(confDomain, configuration, report)
      report.end = Date.now()
      send({ si, ii, report: reportId })
    }
    else send({ si, ii })
  }
  else send({ si, ii })
}

export async function applyConfiguration(domain, { postgres }, report) {
  const tasks = []

  if (postgres) tasks.push(() => configurePostgres(domain, postgres, report))

  return Promise.all(tasks.map(t => t()))
}

async function configurePostgres(domain, { tables, functions }, report) {
  report.tasks.postgres = {}
  //  TODO: might want to error out if metadata table is configured
  return Promise.all([
    syncTables(domain, { ...tables, ...POSTGRES_DEFAULT_TABLES }, report),
    syncFunctions(domain, functions, report),
  ])
}

async function syncTables(domain, tables, report) {
  report.tasks.postgres.tables = {}

  const { rows: existingTables } = await postgres.query(domain, `
    SELECT tablename
    FROM pg_catalog.pg_tables
    WHERE schemaname != 'pg_catalog'
      AND schemaname != 'information_schema'
  `)

  const existingTableNames = existingTables.map(({tablename}) => tablename)
  const removedTables = existingTableNames.filter(name => !tables[name])

  //  initialize table task queues
  removedTables.forEach(name => report.tasks.postgres.tables[name] = [])
  Object.keys(tables).forEach(name => report.tasks.postgres.tables[name] = [])

  //  delete existing tables not in tables
  const removeTablePromises = (
    removedTables
      .map(async name => {
        const tableTasks = report.tasks.postgres.tables[name]
        try {
          tableTasks.push(`Removing`)
          await postgres.removeTable(domain, name)
          tableTasks.push(`Done`)
        }
        catch (error) {
          console.log('TODO: some sort of audit logging, or expose error...')
          console.log(error)
          tableTasks.push('Error')
        }
      })
  )

  //  create tables and supply columns for column updates
  const createAndSyncTablePromises = (
    Object
      .entries(tables)
      .map(async ([table, { type, columns }]) => {
        const tableTasks = report.tasks.postgres.tables[table]

        const allParams = []
        const orderedColumns = Object.keys(columns)
        tableTasks.push('Creating')
        await postgres.createTable(domain, table, columns)
        //  TODO: streaming, and less front end processing of result is probably
        //        a low hanging fruit optimization when the time is right
        tableTasks.push('Fetching syncable states from metadata')
        const { rows } = await (
          table === 'metadata'
            ? postgres.query(ADMIN_DOMAIN, 'SELECT id FROM metadata WHERE domain = $1', [domain])
            : postgres.query(ADMIN_DOMAIN, 'SELECT id FROM metadata WHERE domain = $1 AND active_type = $2', [domain, type])
        )

        tableTasks.push(`0/${rows.length} rows synced`)

        if (rows.length === 0) {
          tableTasks.push('Done')
          return
        }

        const transaction = redis.client.multi()
        //  TODO: limit fetched data to data in table columns
        rows.forEach(({ id }) => transaction.json.get(id))
        tableTasks.push(`Fetching ${rows.length} states to sync`)
        const states = await transaction.exec()

        tableTasks.push(`Assembling sync query for ${rows.length} states`)
        states.forEach((state, index) => {
          if (!state) throw new Error(`TRYING TO ADD ROW FOR NON-EXISTENT SCOPE ${domain} ${table} ${id}`)
          const data = table === 'metadata' ? state : state.active

          allParams.push(rows[index].id)
          allParams.push(
            ...orderedColumns
              .map(column => {
                if (data[column] === undefined) return null
                else if (columns[column] === 'TIMESTAMP') return new Date(data[column])
                else return data[column]
              })
          )
        })

        tableTasks.push(`Syncing ${rows.length}/${rows.length} rows`)
        await batchInsertRows(domain, table, orderedColumns, rows, allParams)
        tableTasks.push(`Done`)
      })
  )

  await Promise.all([
    ...removeTablePromises,
    ...createAndSyncTablePromises
  ])
}

function rowString(start, numEntries) {
  let s = '('
  const end = start + numEntries
  for (let i=start; i<=end; i++) {
    s += `$${ i + 1 }${ i<end ? ',' : '' }`
  }
  return s + ')'
}

async function batchInsertRows(domain, table, columns, rows, params) {

  const rowsInBatch = Math.floor(MAX_PARAMS_IN_BATCH / columns.length)
  const batches = []

  const numBatches = Math.ceil(rows.length / rowsInBatch)
  for (let batch=0; batch < numBatches; batch++) {
    batches.push(insertRows(
      domain,
      table,
      columns,
      rows.slice(
        batch*rowsInBatch,
        (batch + 1)*rowsInBatch
      ),
      params.slice(
        // need to add 1 to columns.length because params includes id for each row
        batch*rowsInBatch*(columns.length + 1),
        (batch + 1)*rowsInBatch*(columns.length + 1)
      )
    ))
  }
  await Promise.all(batches)
}

function insertRows(domain, table, columns, rows, params) {
  return postgres.query(
    domain,
    `
    INSERT INTO ${postgres.purifiedName(table)}
      (id,${columns.map(postgres.purifiedName).join(',')})
      VALUES
        ${
          rows
            .map((_, index) => rowString(index * (columns.length + 1), columns.length))
            .join(',\n')
        }
      ON CONFLICT (id) DO UPDATE
      SET
        ${
          columns
            .map(postgres.purifiedName)
            .map(name => `${name} = excluded.${name}`)
            .join(',\n')
        }
    `,
    params
  )
}

async function syncFunctions(domain, functions, report) {
  report.tasks.postgres.functions = {}

  const { rows: existingFunctions } = await postgres.query(domain, `
    SELECT proname
    FROM pg_proc
    WHERE pronamespace = 'public'::regnamespace
  `)

  const functionNames = existingFunctions.map(f => f.proname)
  const removedFunctions = functionNames.filter(name => !functions[name])

  //  initialize function task queues
  removedFunctions.forEach(name => report.tasks.postgres.functions[name] = [])
  Object.keys(functions).forEach(name => report.tasks.postgres.functions[name] = [])

  //  delete existing functions not in functions
  const removedFunctionPromises = (
    removedFunctions
      .map(async name => {
        const tasks = report.tasks.postgres.functions[name]
        tasks.push('Deleting')
        await postgres.deleteFunction(domain, name)
        tasks.push('Done')
      })
  )

  //  apply configuration for specified functions
  const configuredFunctionPromises = (
    Object
      .entries(functions)
      .map(async ([name, def]) => {
        const tasks = report.tasks.postgres.functions[name]
        tasks.push('Creating')
        try {
          await postgres.createFunction(domain, name, def)
          tasks.push('Done')
        }
        catch (error) {
          console.log('TODO: audit error, or perhaps send into progress report')
          console.log(error)
          tasks.push('Error')
        }
      })
  )

  await Promise.all([
    ...removedFunctionPromises,
    ...configuredFunctionPromises
  ])

}
