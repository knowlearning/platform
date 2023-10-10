export default {
  metadata: {
    columns: {
      active_type: 'TEXT',
      domain: 'TEXT',
      name: 'TEXT',
      updated: 'TIMESTAMP',
      created: 'TIMESTAMP',
      owner: 'TEXT',
      ii: 'INTEGER',
      active_size: 'INTEGER',
      storage_size: 'INTEGER'
    },
    indices: {
      updated: { column: 'updated' },
      created: { column: 'created' }
    }
  },
  sessions: {
    type: 'application/json;type=session',
    columns: {
      session_credential: 'TEXT',
      user_id: 'TEXT',
      loaded: 'BIGINT',
      connected: 'BIGINT',
      authenticated: 'BIGINT',
      provider: 'TEXT'
    }
  },
  subscriptions: {
    type: 'application/json;type=subscription',
    columns: {
      scope: 'TEXT',
      initialized: 'BIGINT',
      synced: 'BIGINT'
    }
  },
  queries: {
    type: 'application/json;type=postgres-query',
    columns: {
      query: 'TEXT',
      domain: 'TEXT',
      requested: 'BIGINT',
      db_latency: 'INTEGER',
      responded: 'BIGINT'
    }
  },
  tags: {
    type: 'application/json;type=tag',
    columns: {
      context: 'TEXT[]',
      tag_type: 'TEXT',
      target: 'TEXT'
    }
  }
}