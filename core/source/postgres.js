import { randomBytes, pg, environment, escapePostgresLiteral } from './utils.js'
import { postgresClientPools as clientPools } from './stateful.js'
import { DEFAULT_STORAGE_SERVER, storageServerForDomain } from './storage-routing.js'

// necessary to ensure that
function purifiedName(name) {
  if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) return name
  else throw new Error('INVALID NAME ' + name)
}

export function domainToDbName(domain) {

  if (/^[a-zA-Z0-9_\-\.:]*$/.test(domain)) return domain
  else throw new Error('INVALID DB NAME' + domain)
}

const { POSTGRES_SERVERS } = environment

const constantMap = {
  PLpgSQL: 'PLpgSQL',
  BOOLEAN: 'BOOLEAN',
  TEXT: 'TEXT',
  'TEXT[]': 'TEXT[]',
  TIMESTAMP: 'TIMESTAMP',
  INTEGER: 'INTEGER',
  BIGINT: 'BIGINT',
  JSON: 'JSON',
  JSONB: 'JSONB',
  DECIMAL: 'DECIMAL',
  NUMERIC: 'NUMERIC',
  FLOAT: 'FLOAT',
  UUID: 'UUID'
}

const ignorableErrors = {
  '42P07': true, // table already exists
  '42701': true, // column already exists
  '42P04': true  // database already exists
}

function parseJSONEnvironment(name, value) {
  if (!value) throw new Error(`${name} is required`)

  try {
    const parsed = JSON.parse(value)

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      throw new Error('must be a JSON object')
    }

    return parsed
  }
  catch (error) {
    throw new Error(`${name} must be valid JSON object: ${error.message}`)
  }
}

const postgresServers = parseJSONEnvironment('POSTGRES_SERVERS', POSTGRES_SERVERS)
const defaultPostgresServer = DEFAULT_STORAGE_SERVER

if (!postgresServers[defaultPostgresServer]) {
  throw new Error(`POSTGRES_SERVERS.${defaultPostgresServer} is required`)
}

function serverNameForDomain(domain) {
  return storageServerForDomain(domain, 'postgres')
}

function configurationKeyForDomain(domain) {
  return JSON.stringify([serverNameForDomain(domain), domain])
}

function clientConnectionInfo(serverName, database) {
  const server = postgresServers[serverName]

  if (!server || typeof server !== 'object' || Array.isArray(server)) {
    throw new Error(`POSTGRES_SERVERS.${serverName} must be a connection info object`)
  }

  const {
    host,
    port,
    password,
    user='postgres'
  } = server

  const parsedPort = Number(port)

  if (!host) throw new Error(`POSTGRES_SERVERS.${serverName}.host is required`)
  if (!Number.isInteger(parsedPort) || parsedPort <= 0) {
    throw new Error(`POSTGRES_SERVERS.${serverName}.port must be a positive integer`)
  }

  const info = {
    host,
    port: parsedPort,
    user,
    database
  }

  if (password !== undefined) info.password = password

  return info
}

async function createDatabase(serverName, database) {
  try {
    await queryOnServer(serverName, 'postgres', `CREATE DATABASE "${database}"`)
  }
  catch (error) {
    console.log(error)
    if (!ignorableErrors[error.fields?.code || error.code]) {
      console.log('ERROR CREATING DATABASE!!!!!', serverName, database, error)
      throw error
    }
  }
}

function clientKey(serverName, database) {
  return JSON.stringify([serverName, database])
}

function normalizePostgresError(error) {
  if (error && typeof error === 'object') {
    error.fields ||= {}
    if (error.code !== undefined && error.fields.code === undefined) {
      error.fields.code = error.code
    }
    if (error.message !== undefined && error.fields.message === undefined) {
      error.fields.message = error.message
    }
  }

  return error
}

async function clientForDatabase(serverName, database) {
  const key = clientKey(serverName, database)

  if (!clientPools[key]) {
    const poolPromise = (async () => {
      if (database !== 'postgres') await createDatabase(serverName, database)

      const pool = new pg.Pool({
        ...clientConnectionInfo(serverName, database),
        max: 20
      })

      if (database !== 'postgres') {
        queryOnServer(serverName, database, 'CREATE EXTENSION IF NOT EXISTS plpgsql')
          .catch(error => console.warn(`error creating plpgsql extension for ${serverName}/${database}`, error))
      }

      return pool
    })()

    clientPools[key] = poolPromise.catch(error => {
      delete clientPools[key]
      throw error
    })
  }

  return clientPools[key]
}

function databaseForDomain(domain) {
  return domain === 'postgres' ? 'postgres' : domainToDbName(domain)
}

async function queryOnServer(serverName, database, text, values, rowMode, maxRetries = 5, delayMs = 200) {
  let attempt = 0
  const pool = await clientForDatabase(serverName, database)

  while (true) {
    let connection
    try {
      connection = await pool.connect()
      return await connection.query({
        text,
        values
      })
    } catch (err) {
      const error = normalizePostgresError(err)
      attempt++

      // TODO: only fatal connection errors should force connection end
      // forcibly close / evict
      if (connection) {
        try { connection.release(true) } catch (_) {}
        connection = null
      }

      if (attempt >= maxRetries) throw error
      await new Promise(res => setTimeout(res, delayMs))
    } finally {
      if (connection) try { connection.release() } catch (_) {}
    }
  }
}

async function query(database, text, values, rowMode, maxRetries = 5, delayMs = 200) {
  return queryOnServer(
    serverNameForDomain(database),
    databaseForDomain(database),
    text,
    values,
    rowMode,
    maxRetries,
    delayMs
  )
}


async function createTable(domain, table, columns) {
  //  TODO: remove columns that no longer exist
  const columnEntryUpsert = ([column, type]) => `
    IF EXISTS (
        SELECT column_name
        FROM information_schema.columns
        WHERE table_name = '${purifiedName(table)}'
          AND column_name = '${purifiedName(column)}'
    )
    THEN
        ALTER TABLE ${purifiedName(table)}
        ALTER COLUMN ${purifiedName(column)} TYPE ${constantMap[type]}
        USING ${purifiedName(column)}::${constantMap[type]};
    ELSE
        ALTER TABLE ${purifiedName(table)}
        ADD COLUMN ${purifiedName(column)} ${constantMap[type]};
    END IF;
  `

  await query(domain, `
    DO $$
    BEGIN
      CREATE TABLE IF NOT EXISTS ${purifiedName(table)} (id TEXT NOT NULL, PRIMARY KEY (id));
      ${
        Object
          .entries(columns)
          .map(columnEntryUpsert)
          .join('\n')
      }
    END $$;
  `)
}

async function createIndex(domain, name, table, column) {
  await query(domain, `
    DO $$
    BEGIN
      CREATE INDEX IF NOT EXISTS ${purifiedName(name)} ON ${purifiedName(table)} (${purifiedName(column)});
    END $$;
  `)
}

async function createGinIndex(domain, name, table, column) {
  await query(domain, `
    DO $$
    BEGIN
      CREATE INDEX IF NOT EXISTS ${purifiedName(name)} ON ${purifiedName(table)} USING GIN (${purifiedName(column)});
    END $$;
  `)
}

async function createFunction(domain, name, definition) {
  await deleteFunction(domain, name) // if arguments change, postgres treats functions with the same name as different

  const { returns, body, language } = definition
  //  TODO: handle args

  //  use random delimiter to prevent injection
  const delimiter = randomBytes(32, 'hex')
  const args = (
    definition
      .arguments
      .map(({name, type}) => `${purifiedName(name)} ${constantMap[type]}`)
      .join(', ')
  )
  return query(
    domain,
    `
      CREATE OR REPLACE FUNCTION ${purifiedName(name)} (${args})
      RETURNS ${serializeFunctionReturnDefinition(returns)} AS
      $_${delimiter}$\n${body}
      $_${delimiter}$
      LANGUAGE ${constantMap[language]} STABLE
    `
  )
}

function serializeFunctionReturnDefinition(def) {
  if (typeof def === 'string') return constantMap[def]

  return  `TABLE (${
    Object
      .entries(def)
      .map(([name, type]) => `${purifiedName(name)} ${constantMap[type]}`)
      .join(',\n')
  })`
}

async function deleteFunction(domain, name) {
  //  This ensures all previously declared functions will be removed
  const q = `DO $$
    DECLARE
      function_id    TEXT;
    BEGIN
      FOR function_id IN
        SELECT oid::regprocedure
        FROM pg_proc
        WHERE proname = ${escapePostgresLiteral(name)}
        AND pg_function_is_visible(oid)
      LOOP
        EXECUTE 'DROP FUNCTION IF EXISTS ' || function_id || ';';
      END LOOP;
    END $$;
  `
  return query(domain, q)
}

async function removeTable(database, table) {
  return query(database, `DROP TABLE IF EXISTS ${purifiedName(table)}`)
}

async function removeColumn(database, table, column) {
  return query(database, `ALTER TABLE ${purifiedName(table)} DROP COLUMN ${purifiedName(column)}`)
}

//  TODO: change to setRow
function setRow(domain, table, columns, id, state, firstParamIndex=1) {
  const data = table === 'metadata' ? state : state.active

  if (!data) {
    return [
      `DELETE FROM ${purifiedName(table)} WHERE id = $${firstParamIndex}`
      [id]
    ]
  }
  else {
    const columnNames = Object.keys(columns).filter(name => name !== 'id')
    const columnString = columnNames.map(purifiedName).join(',')
    const rowValues = columnNames.map((_, index) => `$${firstParamIndex + index + 1}`).join(',')
    const orderedValues = columnNames.map(n => {
      if (data[n]    === undefined  ) return null
      if (columns[n] === 'TIMESTAMP') return new Date(data[n])
      if (columns[n] === 'JSONB'    ) return JSON.stringify(data[n])
      return data[n]
    })
    return [
      `
        INSERT INTO ${purifiedName(table)}
          (id,${columnString}) VALUES ($${firstParamIndex},${rowValues})
        ON CONFLICT(id) DO UPDATE SET
          (${columnString}) = ROW (${rowValues})
        ;
      `,
      [id, ...orderedValues]
    ]
  }
}

async function removeRow(domain, table, id) {
  return query(domain, `DELETE FROM ${purifiedName(table)} WHERE id = $1`, [id])
}

async function setColumn(domain, table, column, id, value) {
  if (column.toLowerCase() === 'id') return

  //  TODO: have strategy for timestamps beyond metadata columns
  value = table === 'metadata' && (column === 'created' || column === 'updated')
      ? new Date(value)
      : value

  return query(domain, `UPDATE ${purifiedName(table)} SET ${purifiedName(column)} = $1 WHERE id = $2`, [value, id])
}

export {
  createTable,
  createIndex,
  createGinIndex,
  removeTable,
  removeColumn,
  setColumn,
  setRow,
  removeRow,
  createFunction,
  deleteFunction,
  configurationKeyForDomain,
  purifiedName,
  query
}
