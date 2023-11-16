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
      },
      domain_configurations: {
        type: 'application/json;type=domain-config',
        columns: {
          domain: 'TEXT',
          config: 'TEXT',
          report: 'TEXT'
        }
      }
    },
    functions: {},
    scopes: {
      'current-config': `
        SELECT config, report
        FROM domain_configurations dc
        LEFT JOIN metadata md ON md.id = dc.id
        WHERE dc.domain = $1
        ORDER BY md.created DESC
        LIMIT 1
      `
    }
  }
}