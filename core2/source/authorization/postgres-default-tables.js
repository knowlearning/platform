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
      created: { column: 'created' },
      owner: { column: 'owner' },
      name: { column: 'name' },
      domain: { column: 'domain' }
    }
  }/*, TODO: Put back in if necessary while using nats auth...
  sessions: {
    type: 'application/json;type=session',
    columns: {
      session_credential: 'TEXT',
      sid_encrypted_info: 'TEXT',
      user_id: 'TEXT',
      loaded: 'BIGINT',
      connected: 'BIGINT',
      authenticated: 'BIGINT',
      provider: 'TEXT'
    }
  }*/
}