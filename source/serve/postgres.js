import crypto from 'crypto'
import pg from 'pg'
import configuration from './configuration.js'
import { applyConfiguration } from './side-effects/config.js'

const hex = s => Buffer.from(s).toString('hex')

// necessary to ensure that
function purifiedName(name) {
  if (/^[a-zA-z_][a-zA-Z0-9_]*$/.test(name)) return name
  else throw new Error('INVALID NAME ' + name)
}

const {
  POSTGRES_HOST,
  POSTGRES_PORT,
  POSTGRES_PASSWORD
} = process.env

const constantMap = {
  PLpgSQL: 'PLpgSQL',
  BOOLEAN: 'BOOLEAN',
  TEXT: 'TEXT',
  'TEXT[]': 'TEXT[]',
  TIMESTAMP: 'TIMESTAMP',
  INTEGER: 'INTEGER'
}

const ignorableErrors = {
  '42P07': true, // table already exists
  '42701': true, // column already exists
  '42P04': true  // database already exists
}

const config = {
  host: POSTGRES_HOST,
  port: POSTGRES_PORT,
  user: 'postgres',
  password: POSTGRES_PASSWORD
}

const clients = {}

async function client(domain) {
  if (clients[domain]) return clients[domain]

  const database = domain !== 'postgres' ? 'domain_' + hex(domain) : domain

  if (domain !== 'postgres') {
    //  Create database for domain on-demand
    const c = await client('postgres')
    try {
      await c.query(`CREATE DATABASE ${purifiedName(database)}`)
      //  TODO: track report (third arument)
      const report = { tasks: [], start: Date.now() }
      await applyConfiguration(domain, await configuration(domain), report)
    }
    catch (error) {
      if (!ignorableErrors[error.code]) {
        console.log('ERROR CREATING DATABASE!!!!!', error)
      }
    }
  }

  clients[domain] = new Promise(resolve => {
    const retry = error => {
      if (error) console.log('error connecting to postgres', error)
      const client = new pg.Client({ ...config, database })
      client
        .connect()
        .then(() => {
          client.query('CREATE EXTENSION IF NOT EXISTS plpgsql')
          resolve(client)
        })
        .catch(async () => setTimeout(retry, 1000))
    }
    retry()
  })

  return clients[domain]
}

async function query(database, text, values, rowMode) {
  const c = await client(database)
  return c.query({ text, values, rowMode })
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

async function createFunction(domain, name, definition) {
  await deleteFunction(domain, name) // if arguments change, postgres treats functions with the same name as different

  const { returns, body, language } = definition
  //  TODO: handle args

  //  use random delimiter to prevent injection
  const delimiter = crypto.randomBytes(32).toString('hex')
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
      function_id TEXT;
    BEGIN
      FOR function_id IN
        SELECT oid::regprocedure
        FROM pg_proc
        WHERE proname = ${pg.escapeLiteral(name)}
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

  return query(domain, `UPDATE ${purifiedName(table)} SET ${purifiedName(column)} = $1 WHERE id = $2`, [value, id])
}

export {
  client,
  createTable,
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