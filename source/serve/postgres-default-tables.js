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
    }
  },
  sessions: {
    type: 'application/json;type=session',
    columns: {
      session_credential: 'TEXT',
      user_id: 'TEXT',
      provider: 'TEXT'
      //  TODO: add start and end timestamp
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