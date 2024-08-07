

//import { domainAdmin } from '../configuration.js'
//import domainAgent from '../domain-agent.js'
///import * as redis from '../redis.js'


import { parseYAML } from './externals.js'
import { download } from './storage.js'
/* TODO: bring back
import * as postgres from '../postgres.js'
import POSTGRES_DEFAULT_TABLES from '../postgres-default-tables.js'
import configuration from '../configuration.js'
*/
import Agent from './agent/deno/deno.js'

function domainAdmin(domain) {
  return 'none'
}

const EXISTING_TABLES_QUERY = `
  SELECT tablename
  FROM pg_catalog.pg_tables
  WHERE schemaname != 'pg_catalog'
    AND schemaname != 'information_schema'
`

const EXISTING_FUNCTIONS_QUERY = `
  SELECT proname
  FROM pg_proc
  WHERE pronamespace = 'public'::regnamespace
`

const insertRowsQuery = (table, columns, rows) => `
INSERT INTO ${postgres.purifiedName(table)}
  (id,${columns.map(postgres.purifiedName).join(',')})
  VALUES
    ${ rows.map((_id, index) => rowString(index * (columns.length + 1), columns.length)).join(',\n    ') }
  ON CONFLICT (id) DO UPDATE
  SET
    ${ columns.map(postgres.purifiedName).map(name => `${name} = excluded.${name}`).join(',\n     ') }
`

const MAX_PARAMS_IN_BATCH = 10_000


const ADMIN_DOMAIN = 'admin.knowlearning.systems'
const MODE = 'local'

async function isAdmin(user, requestingDomain, requestedDomain) {
  return (
       (MODE === 'local' && requestingDomain.split(':')[0] === 'localhost')
    || requestingDomain === `${user}.localhost:${parseInt(requestingDomain.split(':')[1])}`
    || (requestingDomain === ADMIN_DOMAIN && user === await domainAdmin(requestedDomain))
  )
}

export default async function configure(domain, config, report) {
  //const { config, report, domain:domainToConfigure } = value
  //const domainConfig = await coreState('core', 'domain-config', 'core')
  //domainConfig[domainToConfigure] = { config, report, admin: user }
  const reportState = await Agent.state(report)
  reportState.tasks = {}
  reportState.start = Date.now()
  try {
    console.log('DOWNLOADING!', config)
    const url = await download(config, 3, true)
    console.log('GOT URL FOR CONFIG!!!!!!!!!!!!', url)
    const response = await fetch(url)
    console.log('GOT RESPONSE!!!!!!!!!!', response)
    if (response.status !== 200) throw new Error('Error getting config')
    response
      .text()
      .then(parseYAML)
      .then(configuration => applyConfiguration(domain, configuration, reportState))
      .then(() => reportState.end = Date.now())
      .catch(error => reportState.error = error.toString())
  }
  catch (error) {
    console.error(error)
    reportState.error = error.toString()
  }
}

export async function applyConfiguration(domain, { postgres, agent }, report) {
  const tasks = []
  if (postgres) tasks.push(() => configurePostgres(domain, postgres, report))
  //if (agent) configureAgent(domain, agent, report)

  return Promise.all(tasks.map(t => t()))
}

async function configureAgent(domain, agent, report) {
  report.tasks.agent = ['initializing']
  try {
    await domainAgent(domain, true)
    report.tasks.agent.push('done')
  }
  catch (error) {
    const { message, lineno, colno } = error
    console.log('AGENT STARTUP ERROR', domain, error)
    report.tasks.agent.push(`ERROR: ${message}\nline: ${lineno}, column: ${colno}`)
  }
}

async function configurePostgres(domain, { tables={}, functions={} }, report) {
  report.tasks.postgres = {}
  return Promise.all([
    syncTables(domain, { ...tables, ...POSTGRES_DEFAULT_TABLES }, report),
    syncFunctions(domain, functions, report),
  ])
}

async function syncTables(domain, tables, report) {
  report.tasks.postgres.tables = {}

  const { rows: existingTables } = await postgres.query(domain, EXISTING_TABLES_QUERY)

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
          console.warn('TODO: some sort of audit logging, or expose error...')
          console.warn(error)
          tableTasks.push('Error')
        }
      })
  )

  await Promise.all(removeTablePromises)

  const typeGroups = {}

  Object.values(tables).forEach(({type}) => typeGroups[type] = [])

  //  TODO: do in chunks...
  const allIds = await redis.client.sendCommand(['smembers', domain])

  const typeBatchSize = 10_000

  report.tasks.postgres.prepare = []
  const prepTasks = report.tasks.postgres.prepare

  const numBatches = Math.ceil(allIds.length / typeBatchSize)
  prepTasks.push(`Starting ${numBatches} batches to gather existing scope types`)

  for (let batchNum = 0; batchNum < numBatches; batchNum += 1) {
    prepTasks.push(`Starting batch ${batchNum + 1}/${numBatches}`)
    const start = batchNum * typeBatchSize
    const end = start + typeBatchSize
    const batchIds = allIds.slice(start, end)
    const transaction = redis.client.multi()
    batchIds.forEach(id => transaction.json.get(id, { path: [`$.active_type`] }))
    const batchTypes = await transaction.exec()

    for (let idNum = 0; idNum < batchIds.length; idNum += 1) {
      const id = batchIds[idNum]
      const active_type = batchTypes[idNum]?.[0]
      if (typeGroups[active_type]) typeGroups[active_type].push(id)
    }
  }
  prepTasks.push('Done')

  //  create tables and supply columns for column updates
  const tableEntries = Object.entries(tables)

  for (let tableNum = 0; tableNum < tableEntries.length; tableNum += 1) {
    const [table, { type, columns={}, indices={} }] = tableEntries[tableNum]
    const tableTasks = report.tasks.postgres.tables[table]

    const orderedColumns = Object.keys(columns)
    tableTasks.push('Creating')
    await postgres.createTable(domain, table, columns)
    tableTasks.push('Fetching syncable states from metadata')

    const rows = table === 'metadata' ? allIds : typeGroups[type]

    tableTasks.push(`0/${rows.length} rows synced`)

    tableTasks.push(`Creating ${Object.keys(indices).length} indices`)

    await Object.entries(indices).map(async ([name, { column }]) =>  {
      tableTasks.push(`Creating index named ${name} on ${table} for ${column}`)
      await postgres.createIndex(domain, name, table, column)
    })

    if (rows.length > 0) {
      const batchSize = 100_000
      //  too many transactions queued up will trigger a "RangeError: Too many elements passed to Promise.all"
      for (let batchNum=0; batchNum * batchSize < rows.length; batchNum += 1) {
        const transaction = redis.client.multi()
        //  TODO: limit fetched data to data in table columns
        const start = batchNum * batchSize
        const end = start + batchSize
        const batch = rows.slice(start, end)
        batch.forEach( id => transaction.json.get(id) )
        tableTasks.push(`Fetching ${batch.length} states to sync`)
        const states = await transaction.exec()

        tableTasks.push(`Assembling sync query for ${states.length} states`)
        const rowsToInsert = []
        const paramsToInsert = []
        states.forEach((state, index) => {
          const id = rows[start + index]
          if (!state) return //  TODO: probably want to add id to some sort of report

          const data = table === 'metadata' ? state : state.active

          rowsToInsert.push(id)
          paramsToInsert.push(
            id,
            ...orderedColumns
              .map(column => {
                if (!data || data[column] === undefined) return null
                else if (columns[column] === 'TIMESTAMP') return new Date(data[column])
                else return data[column]
              })
          )
        })

        console.log(`Syncing ${start + batch.length}/${rows.length} rows for ${domain} ${table}`)
        tableTasks.push(`Syncing ${start + batch.length}/${rows.length} rows`)
        await batchInsertRows(domain, table, orderedColumns, rowsToInsert, paramsToInsert)
      }
    }
    tableTasks.push(`Done`)
  }
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

async function insertRows(domain, table, columns, rows, params) {
  const query = insertRowsQuery(table, columns, rows)
  return postgres.query(domain, query, params)
}

async function syncFunctions(domain, functions, report) {
  report.tasks.postgres.functions = {}

  const { rows: existingFunctions } = await postgres.query(domain, EXISTING_FUNCTIONS_QUERY)

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
          console.warn('TODO: audit error, or perhaps send into progress report')
          console.warn(error)
          tasks.push('Error')
        }
      })
  )

  await Promise.all([
    ...removedFunctionPromises,
    ...configuredFunctionPromises
  ])

}

const configuredDomains = {}
export async function ensureDomainConfigured(domain) {
  //  TODO: more reliable check
  if (!configuredDomains[domain]) {
    configuredDomains[domain] = new Promise(async resolve => {
      const report = { tasks: [], start: Date.now() }
      await applyConfiguration(domain, await configuration(domain), report)
        .catch(error => console.warn('configuration error', domain, error))
      resolve()
    })
  }
  await configuredDomains[domain]
}