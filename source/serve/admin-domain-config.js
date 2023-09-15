import POSTGRES_DEFAULT_TABLES from './postgres-default-tables.js'

export default {
  postgres: {
    tables: {
      ...POSTGRES_DEFAULT_TABLES,
      users: {
        type: 'application/json;type=user',
        columns: {
          provider: 'TEXT',
          provider_id: 'TEXT',
          credential: 'TEXT'
        }
      }
    },
    functions: {}
  }
}