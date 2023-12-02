const EMBEDED_QUERY_TEST_MODE = 'EMBEDED_QUERY_TEST_MODE'
const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

export default function () {
  const TEST_TABLE_TYPE = `application/json;type=test-type`

  const TEST_ENTRY_0_ID = uuid()
  const TEST_ENTRY_0 = {
    text_test_column: 'Test Text',
    integer_test_column: 42,
    boolean_test_column: true
  }

  const TEST_ENTRY_1_ID = uuid()
  const TEST_ENTRY_1 = {
    text_test_column: 'Test Text',
    integer_test_column: 42,
    boolean_test_column: true,
    text_array_test_column: null
  }

  const TEST_ENTRY_2_ID = uuid()
  const TEST_ENTRY_2 = {
    text_test_column: 'More Test Text',
    integer_test_column: 84,
    boolean_test_column: false,
    text_array_test_column: null
  }

  const TEST_ENTRY_3_ID = uuid()
  const TEST_ENTRY_3 = {
    text_test_column: 'More Test Text',
    integer_test_column: 84,
    boolean_test_column: false,
    text_array_test_column: ['abc', 'def']
  }

  const CONFIGURATION_1 = `
postgres:
  tables:
    test_table:
      type: ${TEST_TABLE_TYPE}
      columns:
        text_test_column: TEXT
        integer_test_column: INTEGER
        boolean_test_column: BOOLEAN
        text_array_test_column: TEXT[]
  scopes:
    my-test-table-entries: |
      SELECT * FROM test_table WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-previous-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_0_ID}'
    test-function-call:
      SELECT * FROM test_fn('${TEST_ENTRY_0_ID}')
  functions:
    test_fn:
      returns:
        id: TEXT
      language: PLpgSQL
      body: |
        BEGIN
          RETURN QUERY
            SELECT test_table.id AS id
            FROM test_table
            WHERE test_table.id = input_id;
        END;
      arguments:
      - name: input_id
        type: TEXT
`

const CONFIGURATION_2 = `
postgres:
  tables:
    test_table_2:
      type: ${TEST_TABLE_TYPE}
      columns:
        text_test_column: TEXT
        integer_test_column: INTEGER
        boolean_test_column: BOOLEAN
        text_array_test_column: TEXT[]
  scopes:
    my-reconfigured-test-table-entries: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-previous-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_0_ID}'
    my-test-table-entry-after-reconfig: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_2_ID}'
    text-array-test-query: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_3_ID}'
    my-old-test-table: |
      SELECT * FROM test_table
  functions: {}
`

  describe('Postgres configuration', function () {
    it ('Can add scopes before initialization', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_0_ID)
      const state = await Agent.state(TEST_ENTRY_0_ID)
      metadata.active_type = TEST_TABLE_TYPE
      Object.assign(state, TEST_ENTRY_0)
      await Agent.synced()
    })

    it('Can claim and configure domain', async function () {
      const { domain } = await Agent.environment()
      await Agent.claim(domain)

      const config = await Agent.upload(
        'test domain config',
        'application/yaml',
        CONFIGURATION_1
      )
      const report = uuid()
      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })
      await Agent.synced()
      //  TODO: some way to certify that our user has been set as domain admin
    })

    it('Can write a new record of configured table type', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_1_ID)
      const state = await Agent.state(TEST_ENTRY_1_ID)
      metadata.active_type = TEST_TABLE_TYPE
      Object.assign(state, TEST_ENTRY_1)
      await Agent.synced()

      const md2 = await Agent.metadata(TEST_ENTRY_1_ID)
      expect(md2.active_type).to.equal(TEST_TABLE_TYPE)
    })

    it('Can retrieve expected record from test table type', async function () {
      expect(await Agent.query('my-test-table-entries'))
        .to.deep.equal([{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }])
    })


    it('Can retrieve expected record from test table type in an embedded context', async function () {
      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: TEST_ENTRY_1_ID, mode: EMBEDED_QUERY_TEST_MODE }, iframe)

      let closeInfo
      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      await done
      expect(closeInfo).to.deep.equal([{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }])
    })

    it('Can call functions in special query scopes', async function () {
      expect(await Agent.query('test-function-call'))
      .to.deep.equal([{ id: TEST_ENTRY_0_ID }])
    })

    it('Can query metadata for scopes created after configuration', async function () {
      const response = await Agent.query('my-test-table-entries-metadata')
      const { auth: { user }, domain } = await Agent.environment()

      expect(response.length).to.equal(1)
      expect(response[0].id).to.deep.equal(TEST_ENTRY_1_ID)
      expect(response[0].ii).to.equal(1)
      expect(response[0].domain).to.equal(domain)
      expect(response[0].active_type).to.equal(TEST_TABLE_TYPE)
      expect(response[0].owner).to.equal(user)
      expect(response[0].active_size).to.equal(0)
      expect(response[0].storage_size).to.equal(0)
    })

    it('Can query metadata for scopes created before configuration', async function () {
      const response = await Agent.query('my-test-table-previous-entries-metadata')
      const { auth: { user }, domain } = await Agent.environment()

      expect(response.length).to.equal(1)
      expect(response[0].id).to.deep.equal(TEST_ENTRY_0_ID)
      expect(response[0].ii).to.equal(1)
      expect(response[0].domain).to.equal(domain)
      expect(response[0].active_type).to.equal(TEST_TABLE_TYPE)
      expect(response[0].owner).to.equal(user)
      expect(response[0].active_size).to.equal(0)
      expect(response[0].storage_size).to.equal(0)
    })

    it('Can re-configure a domain', async function () {
      const { domain } = await Agent.environment()

      const config = await Agent.upload(
        'test domain config 2',
        'application/yaml',
        CONFIGURATION_2
      )
      const report = uuid()
      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })
      await Agent.synced()
    })

    it('Can get expected result from re-configured table', async function () {
      expect(
        await Agent.query('my-reconfigured-test-table-entries')
      )
      .to.deep.equal(
        [{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }]
      )
    })

    it('Can query metadata for scopes created after re-configuration', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_2_ID)
      metadata.active_type = TEST_TABLE_TYPE
      const state = await Agent.state(TEST_ENTRY_2_ID)
      Object.assign(state, TEST_ENTRY_2)
      await Agent.synced()

      expect( await Agent.query('my-test-table-entry-after-reconfig') )
        .to.deep.equal( [{ id: TEST_ENTRY_2_ID, ...TEST_ENTRY_2 }] )
    })

    it('Can create and query text array columns', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_3_ID)
      metadata.active_type = TEST_TABLE_TYPE
      const state = await Agent.state(TEST_ENTRY_3_ID)
      Object.assign(state, TEST_ENTRY_3)
      await Agent.synced()

      expect( await Agent.query('text-array-test-query') )
        .to.deep.equal( [{ id: TEST_ENTRY_3_ID, ...TEST_ENTRY_3 }] )
    })

    it('Cannot query old tables', async function () {
      let erroredExpectedly = false
      try {
        const state = await Agent.query('my-old-test-table')
      }
      catch (error) { erroredExpectedly = error.error === '42P01' }
      if (!erroredExpectedly) throw new Error('Expected postgres 42P01 error on query involving new table')
    })

  })
}
