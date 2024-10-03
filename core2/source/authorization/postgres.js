import { randomBytes, pg, environment, escapePostgresLiteral } from './externals.js'

// necessary to ensure that
function purifiedName(name) {
  if (/^[a-zA-z_][a-zA-Z0-9_]*$/.test(name)) return name
  else throw new Error('INVALID NAME ' + name)
}

function domainToDbName(domain) {

  if (/^[a-zA-Z0-9_\-\.:]*$/.test(domain)) return domain
  else throw new Error('INVALID DB NAME' + domain)
}

const {
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_USER,
  POSTGRES_PASSWORD
} = environment

const constantMap = {
  PLpgSQL: 'PLpgSQL',
  BOOLEAN: 'BOOLEAN',
  TEXT: 'TEXT',
  'TEXT[]': 'TEXT[]',
  TIMESTAMP: 'TIMESTAMP',
  INTEGER: 'INTEGER',
  BIGINT: 'BIGINT',
  JSON: 'JSON'
}

const ignorableErrors = {
  '42P07': true, // table already exists
  '42701': true, // column already exists
  '42P04': true  // database already exists
}

const config = {
  hostname: POSTGRES_HOST,
  port: POSTGRES_PORT,
  user: POSTGRES_USER,
  password: POSTGRES_PASSWORD
}

const clientPools = {}

async function clientPool(domain) {
  if (clientPools[domain]) return clientPools[domain]
  return clientPools[domain] = new Promise(async resolve => {
    const database = domain === 'postgres' ? 'postgres' : domainToDbName(domain)
    if (domain !== 'postgres') {
      //  Create database for domain on-demand
      try {
        await query('postgres', `CREATE DATABASE "${database}"`)
        query(domain, 'CREATE EXTENSION IF NOT EXISTS plpgsql')
          .catch(error => console.warn(`error creating plpgsql extension for ${database}`, error))
      }
      catch (error) {
        console.log(error)
        if (!ignorableErrors[error.fields.code]) {
          console.log('ERROR CREATING DATABASE!!!!!', error)
        }
      }
    }
    resolve(new pg.Pool({ ...config, database }, 20, true))
  })
}

const hashToConnection = {}
const databaseToConnections = {}

//  TODO: properly release connections from each database's pool
async function connectionForHashKey(database, connectionHashKey) {
  const fullKey = database + '/' + connectionHashKey
  if (hashToConnection[fullKey]) return hashToConnection[fullKey]
  if (!clientPools[database]) clientPools[database] = clientPool(database)

  return hashToConnection[fullKey] = new Promise(async resolve => {
    const pool = await clientPools[database]
    if (pool.available > 0 ) {
      const connection = pool.connect()
      if (!databaseToConnections[database]) databaseToConnections[database] = []
      databaseToConnections[database].push(connection)
      resolve(connection)
    }
    else {
      const dbConnections = databaseToConnections[database]
      const connection = dbConnections[Math.floor(Math.random() * dbConnections.length)]
      resolve(connection)
    }
  })
}

async function query(database, text, values, connectionHashKey) {
  //  TODO: use connection hash key
  const c = await connectionForHashKey(database, connectionHashKey)
  return c.queryObject(text, values)
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

function setRow(domain, table, columns, id, state, firstParamIndex=1) {
  const data = state

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
      if (data[n] === undefined) return null
      if (columns[n] === 'TIMESTAMP') return new Date(data[n])
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

  const t = purifiedName(table)
  const c = purifiedName(column)
  const queryText = `
    INSERT INTO ${t} (id, ${c})
    VALUES ($2, $1)
    ON CONFLICT (id)
    DO UPDATE SET ${c} = EXCLUDED.${c}
  `

  return query(domain, queryText, [value, id])
}

export {
  createTable,
  createIndex,
  removeTable,
  removeColumn,
  setColumn,
  setRow,
  removeRow,
  createFunction,
  deleteFunction,
  purifiedName,
  query
}