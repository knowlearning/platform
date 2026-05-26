import { domainListAllowsDomain, domainPatternMatchesDomain } from '../../../core/source/domain-patterns.js'

const EMBEDED_QUERY_TEST_MODE = 'EMBEDED_QUERY_TEST_MODE'
const EMBEDED_PARALLEL_QUERY_TEST_MODE = 'EMBEDED_PARALLEL_QUERY_TEST_MODE'
const EMBEDED_QUERY_ERROR_TEST_MODE = 'EMBEDED_QUERY_ERROR_TEST_MODE'
const EMBEDED_CROSS_DOMAIN_QUERY_TEST_MODE = 'EMBEDED_CROSS_DOMAIN_QUERY_TEST_MODE'
const DOMAIN_CONFIG_TYPE = 'application/json;type=domain-config'

const endOfReport = id => new Promise(r => Agent.watch(id, u => u.state.end && r()))

export default function () {
  const CURRENT_DOMAIN = window.location.host
  const FOREIGN_QUERY_DOMAIN = `foreign-query-config.${CURRENT_DOMAIN}`
  const CURRENT_DOMAIN_WILDCARD_PATTERN = CURRENT_DOMAIN.split('.').length > 2
    ? `*.${CURRENT_DOMAIN.split('.').slice(1).join('.')}`
    : `${CURRENT_DOMAIN.slice(0, -1)}*`
  const TEST_TABLE_TYPE = `application/json;type=test-type`
  const sortRowsById = rows => [...rows].sort((a, b) => a.id.localeCompare(b.id))
  const sortRowsByValue = rows => [...rows].sort((a, b) => a.value.localeCompare(b.value))
  const waitForQueryResult = async (queryName, expected, params=[], tries=20, delay=25) => {
    let result

    for (let attempt = 0; attempt < tries; attempt += 1) {
      result = await Agent.query(queryName, params)
      if (JSON.stringify(result) === JSON.stringify(expected)) return result
      await pause(delay)
    }

    return result
  }
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
    text_array_test_column: null,
    jsonb_column: null
  }

  const TEST_ENTRY_2_ID = uuid()
  const TEST_ENTRY_2 = {
    text_test_column: 'More Test Text',
    integer_test_column: 84,
    boolean_test_column: false,
    text_array_test_column: null,
    jsonb_column: null
  }

  const TEST_ENTRY_3_ID = uuid()
  const TEST_ENTRY_3 = {
    text_test_column: 'More Test Text',
    integer_test_column: 84,
    boolean_test_column: false,
    text_array_test_column: ['abc', 'def'],
    jsonb_column: null
  }

  const TEST_ENTRY_4_ID = uuid()
  const TEST_ENTRY_4 = {
    text_test_column: 'More Test Text',
    integer_test_column: 84,
    boolean_test_column: false,
    text_array_test_column: ['abc', 'def'],
    jsonb_column: ['abc', 123, 'def', {}]
  }
  const buildImplicitQueryChain = (prefix, depth, terminalBody) => (
    Array
      .from({ length: depth }, (_, index) => {
        const name = `${prefix}-${index}`
        const body = index + 1 === depth
          ? terminalBody
          : `SELECT unnest($${prefix}-${index + 1}::TEXT[]) AS value`
        return `    ${name}: |\n      ${body}`
      })
      .join('\n')
  )
  const DEEP_VALID_CHAIN_QUERIES = buildImplicitQueryChain(
    'deep-valid-chain',
    20,
    `SELECT '${TEST_ENTRY_2_ID}' AS value`
  )
  const DEEP_EXCEEDED_CHAIN_QUERIES = buildImplicitQueryChain(
    'deep-exceeded-chain',
    26,
    `SELECT '${TEST_ENTRY_2_ID}' AS value`
  )
  const expectedSelectedRows = sortRowsById([
    { id: TEST_ENTRY_2_ID, ...TEST_ENTRY_2 },
    { id: TEST_ENTRY_3_ID, ...TEST_ENTRY_3 },
    { id: TEST_ENTRY_4_ID, ...TEST_ENTRY_4 }
  ])

  const CONFIGURATION_1 = `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
postgres:
  tables:
    test_table:
      type: ${TEST_TABLE_TYPE}
      columns:
        text_test_column: TEXT
        integer_test_column: INTEGER
        boolean_test_column: BOOLEAN
        text_array_test_column: TEXT[]
        jsonb_column: JSONB
  queries:
    my-test-table-entries: |
      SELECT * FROM test_table WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-previous-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_0_ID}'
    test-function-call:
      SELECT * FROM test_fn('${TEST_ENTRY_0_ID}')
  functions:
    same_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
    cross_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingDomain
        type: TEXT
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
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
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
variables:
  DOMAIN: wrong-domain.example.com
  FOREIGN_QUERY_DOMAIN: ${FOREIGN_QUERY_DOMAIN}
  SELECTED_TEST_TABLE_IDS_QUERY: selected-test-table-ids
  RUN_SPECIFIC_QUERY: run-specific-test-table-ids
  VARIABLE_BOOLEAN: false
  VARIABLE_INTEGER: 84
  selected_ids: run-specific-test-table-ids
postgres:
  tables:
    test_table_2:
      type: ${TEST_TABLE_TYPE}
      columns:
        text_test_column: TEXT
        integer_test_column: INTEGER
        boolean_test_column: BOOLEAN
        text_array_test_column: TEXT[]
        jsonb_column: JSONB
  queries:
    my-reconfigured-test-table-entries:
      domains:
      - example.com
      body: |
        SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_1_ID}'
    my-test-table-previous-entries-metadata: |
      SELECT * FROM metadata WHERE id = '${TEST_ENTRY_0_ID}'
    my-test-table-entry-after-reconfig: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_2_ID}'
    text-array-test-query: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_3_ID}'
    jsonb-test-query: |
      SELECT * FROM test_table_2 WHERE id = '${TEST_ENTRY_4_ID}'
    selected-test-table-ids: |
      SELECT id
      FROM test_table_2
      WHERE boolean_test_column = $1
        AND integer_test_column = $2
        AND $3::TEXT = $DOMAIN::TEXT
        AND id = ANY('{${TEST_ENTRY_2_ID},${TEST_ENTRY_3_ID},${TEST_ENTRY_4_ID}}'::TEXT[])
      ORDER BY id
    selected-test-table-ids-from-request: |
      SELECT id
      FROM test_table_2
      WHERE boolean_test_column = $1
        AND integer_test_column = 84
        AND id = ANY('{${TEST_ENTRY_2_ID},${TEST_ENTRY_3_ID},${TEST_ENTRY_4_ID}}'::TEXT[])
      ORDER BY id
    selected_ids: |
      SELECT '${TEST_ENTRY_1_ID}' AS value
    passthrough-test-table-ids: |
      SELECT unnest($1::TEXT[]) AS id
    run-specific-test-table-ids: |
      SELECT unnest('{${TEST_ENTRY_2_ID},${TEST_ENTRY_3_ID},${TEST_ENTRY_4_ID}}'::TEXT[]) AS id
    multi-column-test-table-values: |
      SELECT id, text_test_column
      FROM test_table_2
      WHERE id = '${TEST_ENTRY_2_ID}'
    single-run-specific-test-table-id: |
      SELECT '${TEST_ENTRY_2_ID}' AS id
    empty-test-table-ids: |
      SELECT id
      FROM test_table_2
      WHERE id = 'missing-${TEST_ENTRY_2_ID}'
    external-query-selected-entries:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - $1
          - 84
          - $DOMAIN
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    variable-domain-and-query-external-query-selected-entries:
      external:
        selected_ids:
          domain: $FOREIGN_QUERY_DOMAIN
          query: foreign-run-specific-test-table-ids
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    variable-query-name-external-query-selected-entries:
      external:
        selected_ids:
          domain: $DOMAIN
          query: $RUN_SPECIFIC_QUERY
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    variable-param-external-query-selected-entries:
      external:
        selected_ids:
          domain: $DOMAIN
          query: $SELECTED_TEST_TABLE_IDS_QUERY
          params:
          - $VARIABLE_BOOLEAN
          - $VARIABLE_INTEGER
          - $DOMAIN
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    repeated-external-query-counts:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - false
          - 84
          - $DOMAIN
      body: |
        SELECT
          cardinality($selected_ids::TEXT[]) AS first_count,
          cardinality($selected_ids::TEXT[]) AS second_count
    multi-external-query-counts:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - false
          - 84
          - $DOMAIN
        first_selected_id:
          domain: $DOMAIN
          query: single-run-specific-test-table-id
      body: |
        SELECT
          cardinality($selected_ids::TEXT[]) AS selected_count,
          cardinality($first_selected_id::TEXT[]) AS first_count
    mixed-query-selected-entries:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - $1
          - 84
          - $DOMAIN
      body: |
        SELECT *
        FROM test_table_2
        WHERE boolean_test_column = $1
          AND id = ANY($selected_ids::TEXT[])
          AND id = ANY($selected-test-table-ids-from-request::TEXT[])
        ORDER BY id
    compacted-param-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - $1
          - 84
          - $DOMAIN
      body: |
        SELECT
          $1::BOOLEAN AS bool_value,
          cardinality($selected_ids::TEXT[]) AS selected_count,
          $DOMAIN::TEXT AS domain_value
    zero-arg-external-query-selected-entries:
      external:
        selected_ids:
          domain: $DOMAIN
          query: run-specific-test-table-ids
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    implicit-query-selected-entries: |
      SELECT *
      FROM test_table_2
      WHERE id = ANY($selected-test-table-ids-from-request::TEXT[])
      ORDER BY id
    implicit-unnest-query-values: |
      SELECT unnest($selected-test-table-ids-from-request::TEXT[]) AS value
      ORDER BY value
    repeated-implicit-query-counts: |
      SELECT
        cardinality($selected-test-table-ids-from-request::TEXT[]) AS first_count,
        cardinality($selected-test-table-ids-from-request::TEXT[]) AS second_count
    missing-implicit-query: |
      SELECT unnest($missing-implicit-query-target::TEXT[]) AS value
    positional-only-query: |
      SELECT
        $1::BOOLEAN AS first_value,
        $1::BOOLEAN AS second_value
    positional-and-named-query: |
      SELECT
        $1::BOOLEAN AS bool_value,
        $DOMAIN::TEXT AS domain_value
    string-literal-placeholder-query: |
      SELECT '$selected_ids' AS value
    comment-placeholder-query: |
      SELECT '${TEST_ENTRY_2_ID}' AS value -- $selected_ids
    quoted-identifier-placeholder-query: |
      SELECT 1 AS "$selected_ids"
    dollar-quoted-placeholder-query: |
      SELECT $$ $selected_ids $$ AS value
    explicit-external-overrides-domain-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - false
          - 84
          - $DOMAIN
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    body-variable-reference-query: |
      SELECT unnest($RUN_SPECIFIC_QUERY::TEXT[]) AS value
    chained-external-query-selected-entries:
      external:
        initial_ids:
          domain: $DOMAIN
          query: selected-test-table-ids
          params:
          - $1
          - 84
          - $DOMAIN
        chained_ids:
          domain: $DOMAIN
          query: passthrough-test-table-ids
          params:
          - $initial_ids
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($chained_ids::TEXT[])
        ORDER BY id
    circular-external-query:
      external:
        a:
          domain: $DOMAIN
          query: passthrough-test-table-ids
          params:
          - $b
        b:
          domain: $DOMAIN
          query: passthrough-test-table-ids
          params:
          - $a
      body: |
        SELECT unnest($a::TEXT[]) AS value
    missing-domain-external-query:
      external:
        selected_ids:
          query: run-specific-test-table-ids
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    missing-query-external-query:
      external:
        selected_ids:
          domain: $DOMAIN
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    invalid-positional-external-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: passthrough-test-table-ids
          params:
          - $99
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    invalid-named-external-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: passthrough-test-table-ids
          params:
          - $NOPE
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    invalid-variable-external-query:
      external:
        selected_ids:
          domain: $MISSING_VARIABLE
          query: passthrough-test-table-ids
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    non-string-domain-external-query:
      external:
        selected_ids:
          domain: 42
          query: run-specific-test-table-ids
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    non-string-query-external-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: 42
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    multi-column-external-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: multi-column-test-table-values
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    same-domain-external-recursive-query:
      external:
        selected_ids:
          domain: $DOMAIN
          query: same-domain-external-recursive-helper
      body: |
        SELECT unnest($selected_ids::TEXT[]) AS value
    same-domain-external-recursive-helper: |
      SELECT unnest($same-domain-external-recursive-query::TEXT[]) AS value
    literal-domain-external-query-selected-entries:
      external:
        selected_ids:
          domain: '${CURRENT_DOMAIN}'
          query: selected-test-table-ids
          params:
          - false
          - 84
          - '${CURRENT_DOMAIN}'
      body: |
        SELECT *
        FROM test_table_2
        WHERE id = ANY($selected_ids::TEXT[])
        ORDER BY id
    empty-external-query-count:
      external:
        selected_ids:
          domain: $DOMAIN
          query: empty-test-table-ids
      body: |
        SELECT cardinality($selected_ids::TEXT[]) AS value
    self-referential-query: |
      SELECT unnest($self-referential-query::TEXT[]) AS value
    indirect-cycle-a: |
      SELECT unnest($indirect-cycle-b::TEXT[]) AS value
    indirect-cycle-b: |
      SELECT unnest($indirect-cycle-a::TEXT[]) AS value
    implicit-multi-column-query: |
      SELECT unnest($multi-column-test-table-values::TEXT[]) AS value
${DEEP_VALID_CHAIN_QUERIES}
${DEEP_EXCEEDED_CHAIN_QUERIES}
    cross-domain-query-requesting-domain-values:
      external:
        requesting_domain_values:
          domain: '${FOREIGN_QUERY_DOMAIN}'
          query: foreign-requesting-domain-values
      body: |
        SELECT unnest($requesting_domain_values::TEXT[]) AS value
    cross-domain-pattern-query-requesting-domain-values:
      external:
        requesting_domain_values:
          domain: '${FOREIGN_QUERY_DOMAIN}'
          query: wildcard-requesting-domain-values
      body: |
        SELECT unnest($requesting_domain_values::TEXT[]) AS value
    cross-domain-query-context-values:
      external:
        context_values:
          domain: '${FOREIGN_QUERY_DOMAIN}'
          query: foreign-context-values
      body: |
        SELECT unnest($context_values::TEXT[]) AS value
        ORDER BY value
    unauthorized-cross-domain-external-query:
      external:
        requesting_domain_values:
          domain: '${FOREIGN_QUERY_DOMAIN}'
          query: forbidden-requesting-domain-values
      body: |
        SELECT unnest($requesting_domain_values::TEXT[]) AS value
    cross-domain-circular-query:
      external:
        circular_values:
          domain: '${FOREIGN_QUERY_DOMAIN}'
          query: foreign-cross-domain-circular-values
      body: |
        SELECT unnest($circular_values::TEXT[]) AS value
    legacy-query-syntax: |
      SELECT unnest($query($DOMAIN, selected-test-table-ids)::TEXT[]) AS value
    my-old-test-table: |
      SELECT * FROM test_table
  functions:
    same_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
    cross_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingDomain
        type: TEXT
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
`

const FOREIGN_QUERY_CONFIGURATION = `
authorize:
  sameDomain:
    postgres: same_domain_authorization
  crossDomain:
    postgres: cross_domain_authorization
postgres:
  tables: {}
  queries:
    foreign-requesting-domain-values:
      domains:
      - ${CURRENT_DOMAIN}
      body: |
        SELECT $REQUESTING_DOMAIN AS value
    foreign-run-specific-test-table-ids:
      domains:
      - ${CURRENT_DOMAIN}
      body: |
        SELECT '${TEST_ENTRY_2_ID}' AS id
    wildcard-requesting-domain-values:
      domains:
      - '${CURRENT_DOMAIN_WILDCARD_PATTERN}'
      body: |
        SELECT $REQUESTING_DOMAIN AS value
    foreign-context-values:
      domains:
      - ${CURRENT_DOMAIN}
      body: |
        SELECT unnest($CONTEXT::TEXT[]) AS value
    forbidden-requesting-domain-values:
      domains:
      - example.com
      body: |
        SELECT $REQUESTING_DOMAIN AS value
    foreign-cross-domain-circular-values:
      domains:
      - ${CURRENT_DOMAIN}
      external:
        circular_values:
          domain: '${CURRENT_DOMAIN}'
          query: cross-domain-circular-query
      body: |
        SELECT unnest($circular_values::TEXT[]) AS value
  functions:
    same_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
    cross_domain_authorization:
      returns: BOOLEAN
      language: PLpgSQL
      body: |
        BEGIN
          RETURN TRUE;
        END;
      arguments:
      - name: requestingDomain
        type: TEXT
      - name: requestingUser
        type: TEXT
      - name: requestedScope
        type: TEXT
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
      this.timeout(5000)
      const { domain } = await Agent.environment()

      await Agent.claim(domain)

      const config = await Agent.upload({
        name: 'test domain config',
        type: 'application/yaml',
        data: CONFIGURATION_1
      })

      const report = uuid()
      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })

      await endOfReport(report)
      //  TODO: some way to certify that our user has been set as domain admin
    })

    it('Matches domain authorization patterns safely', function () {
      const regexMetacharacters = '.+?^${}()|[]\\'

      expect(domainListAllowsDomain(['app.pilaproject.org'], 'app.pilaproject.org')).to.equal(true)
      expect(domainListAllowsDomain(['*.pilaproject.org'], 'app.pilaproject.org')).to.equal(true)
      expect(domainListAllowsDomain(['*.pilaproject.org'], 'pilaproject.org')).to.equal(false)
      expect(domainListAllowsDomain(['*.pilaproject.org'], 'deep.app.pilaproject.org')).to.equal(false)
      expect(domainListAllowsDomain(['*.pilaproject.org'], '.pilaproject.org')).to.equal(false)
      expect(domainPatternMatchesDomain('*.pilaproject.org', 'app.pilaproject.org.evil.com')).to.equal(false)
      expect(domainPatternMatchesDomain('*.pilaproject.org', 'appXpilaproject.org')).to.equal(false)
      expect(domainPatternMatchesDomain('*.(pilaproject|evil).org', 'app.evil.org')).to.equal(false)
      expect(domainPatternMatchesDomain('api+*.pilaproject.org', 'apidev.pilaproject.org')).to.equal(false)
      expect(domainPatternMatchesDomain('api+*.pilaproject.org', 'api+dev.pilaproject.org')).to.equal(true)
      expect(domainPatternMatchesDomain(
        `prefix${regexMetacharacters}*.pilaproject.org`,
        `prefix${regexMetacharacters}dev.pilaproject.org`
      )).to.equal(true)
      expect(domainPatternMatchesDomain(
        `prefix${regexMetacharacters}*.pilaproject.org`,
        'prefixXYZdev.pilaproject.org'
      )).to.equal(false)
    })

    it('Can write a new record of configured table type', async function () {
      this.timeout(5000)

      const metadata = await Agent.metadata(TEST_ENTRY_1_ID)
      const state = await Agent.state(TEST_ENTRY_1_ID)
      metadata.active_type = TEST_TABLE_TYPE
      Object.assign(state, TEST_ENTRY_1)
      await Agent.synced()

      const md2 = await Agent.metadata(TEST_ENTRY_1_ID)
      expect(md2.active_type).to.equal(TEST_TABLE_TYPE)
    })

    it('Can retrieve expected record from test table type', async function () {
      await Agent.synced()
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
/*
    it('Can resolve many parallel queries at once', async function () {
      this.timeout(5000)
      const numParallelQueries = 1000
      const queries = []
      const expectedValues = []
      for (let i=0; i<numParallelQueries; i++) {
        queries.push(Agent.query('my-test-table-entries'))
        expectedValues.push([{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }])
      }
      const results = await Promise.all(queries)
      expect(expectedValues).to.deep.equal(results)
    })

    it('Can resolve many parallel queries at once embedded', async function () {
      this.timeout(5000)
      console.log('>>>> BEGIN QUERY TEST PARENT')
      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: TEST_ENTRY_1_ID, mode: EMBEDED_PARALLEL_QUERY_TEST_MODE }, iframe)

      let closeInfo

      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      console.log('>>>> AWAITING INNER DONE')
      await done
      expect(closeInfo).to.deep.equal(null)
    })
*/
    it('Throws an error in the embedded context on an embedded query error', async function () {
      this.timeout(2000)
      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: TEST_ENTRY_1_ID, mode: EMBEDED_QUERY_ERROR_TEST_MODE }, iframe)

      let closeInfo

      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      await done
      expect(closeInfo).to.deep.equal(null)
    })

    it('Can call functions in queries', async function () {
      expect(await Agent.query('test-function-call'))
      .to.deep.equal([{ id: TEST_ENTRY_0_ID }])
    })

    it('Can query metadata for scopes created after configuration', async function () {
      const response = await Agent.query('my-test-table-entries-metadata')
      const { auth: { user }, domain } = await Agent.environment()

      expect(response.length).to.equal(1)
      expect(response[0].id).to.deep.equal(TEST_ENTRY_1_ID)
      //expect(response[0].ii).to.equal(1)
      expect(response[0].domain).to.equal(domain)
      expect(response[0].active_type).to.equal(TEST_TABLE_TYPE)
      expect(response[0].owner).to.equal(user)
      //expect(response[0].active_size).to.equal(701)
      //expect(response[0].storage_size).to.equal(0)
    })

    it('Can query metadata for scopes created before configuration', async function () {
      const response = await Agent.query('my-test-table-previous-entries-metadata')
      const { auth: { user }, domain } = await Agent.environment()

      expect(response.length).to.equal(1)
      expect(response[0].id).to.deep.equal(TEST_ENTRY_0_ID)
      //expect(response[0].ii).to.equal(1)
      expect(response[0].domain).to.equal(domain)
      expect(response[0].active_type).to.equal(TEST_TABLE_TYPE)
      expect(response[0].owner).to.equal(user)
      //expect(response[0].active_size).to.equal(671)
      //expect(response[0].storage_size).to.equal(0)
    })

    it('Can re-configure a domain', async function () {
      this.timeout(5000)

      const { domain } = await Agent.environment()

      const config = await Agent.upload({
        name: 'test domain config 2',
        type: 'application/yaml',
        data: CONFIGURATION_2
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain }
      })

      await endOfReport(report)
    })

    it('Can get expected result from re-configured table', async function () {
      await Agent.synced()
      expect(
        await Agent.query('my-reconfigured-test-table-entries')
      )
      .to.deep.equal(
        [{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }]
      )
    })

    it('Can configure a foreign query domain', async function () {
      this.timeout(5000)

      const config = await Agent.upload({
        name: 'foreign query domain config',
        type: 'application/yaml',
        data: FOREIGN_QUERY_CONFIGURATION
      })
      const report = uuid()

      await Agent.create({
        active_type: DOMAIN_CONFIG_TYPE,
        active: { config, report, domain: FOREIGN_QUERY_DOMAIN }
      })

      await endOfReport(report)
    })

    it('Can query metadata for scopes created after re-configuration', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_2_ID)
      metadata.active_type = TEST_TABLE_TYPE
      const state = await Agent.state(TEST_ENTRY_2_ID)
      Object.assign(state, TEST_ENTRY_2)
      await Agent.synced()
      expect(
        await waitForQueryResult(
          'my-test-table-entry-after-reconfig',
          [{ id: TEST_ENTRY_2_ID, ...TEST_ENTRY_2 }]
        )
      )
        .to.deep.equal([{ id: TEST_ENTRY_2_ID, ...TEST_ENTRY_2 }])
    })

    it('Can create and query text array columns', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_3_ID)
      metadata.active_type = TEST_TABLE_TYPE
      const state = await Agent.state(TEST_ENTRY_3_ID)
      Object.assign(state, TEST_ENTRY_3)
      await Agent.synced()
      await pause(50) //  TODO: diagnose test flakiness

      expect( await Agent.query('text-array-test-query') )
        .to.deep.equal( [{ id: TEST_ENTRY_3_ID, ...TEST_ENTRY_3 }] )
    })

    it('Can create and query JSONB columns', async function () {
      const metadata = await Agent.metadata(TEST_ENTRY_4_ID)
      metadata.active_type = TEST_TABLE_TYPE
      const state = await Agent.state(TEST_ENTRY_4_ID)
      Object.assign(state, TEST_ENTRY_4)
      await Agent.synced()
      await pause(50) //  TODO: diagnose test flakiness

      expect( await Agent.query('jsonb-test-query') )
        .to.deep.equal([ { id: TEST_ENTRY_4_ID, ...TEST_ENTRY_4 } ])
    })

    it('Can compose same-domain external queries with positional and named args', async function () {
      expect(await Agent.query('external-query-selected-entries', [false]))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can resolve top-level variables in external query domains', async function () {
      expect(await Agent.query('variable-domain-and-query-external-query-selected-entries'))
        .to.deep.equal([{ id: TEST_ENTRY_2_ID, ...TEST_ENTRY_2 }])
    })

    it('Can resolve top-level variables in external query names', async function () {
      expect(await Agent.query('variable-query-name-external-query-selected-entries'))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can resolve top-level variables in external query params', async function () {
      expect(await Agent.query('variable-param-external-query-selected-entries'))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can implicitly resolve same-domain query references with current params', async function () {
      expect(await Agent.query('implicit-query-selected-entries', [false]))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can mix explicit external references with implicit same-domain references', async function () {
      expect(await Agent.query('mixed-query-selected-entries', [false]))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can resolve zero-arg explicit external references', async function () {
      expect(await Agent.query('zero-arg-external-query-selected-entries'))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can resolve multiple explicit external references in one body', async function () {
      expect(await Agent.query('multi-external-query-counts'))
        .to.deep.equal([{ selected_count: 3, first_count: 1 }])
    })

    it('Can reuse the same explicit external reference in one body', async function () {
      expect(await Agent.query('repeated-external-query-counts'))
        .to.deep.equal([{ first_count: 3, second_count: 3 }])
    })

    it('Can use a literal domain in explicit external references', async function () {
      expect(await Agent.query('literal-domain-external-query-selected-entries'))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Can handle explicit external references with empty result sets', async function () {
      expect(await Agent.query('empty-external-query-count'))
        .to.deep.equal([{ value: 0 }])
    })

    it('Prefers explicit external references over same-domain query names', async function () {
      expect(await Agent.query('explicit-external-overrides-domain-query'))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Does not resolve top-level variables in SQL query bodies', async function () {
      let error

      await Agent.query('body-variable-reference-query').catch(e => error = e)

      expect(error).to.equal('INVALID QUERY REFERENCE')
    })

    it('Can chain explicit external references', async function () {
      expect(await Agent.query('chained-external-query-selected-entries', [false]))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Rejects circular explicit external references', async function () {
      let error

      await Agent.query('circular-external-query').catch(e => error = e)

      expect(error).to.equal('CIRCULAR EXTERNAL QUERY')
    })

    it('Rejects explicit external references with missing domain', async function () {
      let error

      await Agent.query('missing-domain-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY')
    })

    it('Rejects explicit external references with missing query', async function () {
      let error

      await Agent.query('missing-query-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY')
    })

    it('Rejects explicit external references with invalid positional parameters', async function () {
      let error

      await Agent.query('invalid-positional-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY ARGUMENT')
    })

    it('Rejects explicit external references with invalid named bindings', async function () {
      let error

      await Agent.query('invalid-named-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY ARGUMENT')
    })

    it('Rejects explicit external references with missing variable bindings', async function () {
      let error

      await Agent.query('invalid-variable-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY ARGUMENT')
    })

    it('Rejects explicit external references with non-string domains', async function () {
      let error

      await Agent.query('non-string-domain-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY')
    })

    it('Rejects explicit external references with non-string query names', async function () {
      let error

      await Agent.query('non-string-query-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID EXTERNAL QUERY')
    })

    it('Rejects explicit external references to multi-column queries', async function () {
      let error

      await Agent.query('multi-column-external-query').catch(e => error = e)

      expect(error).to.equal('INVALID FOREIGN QUERY RESULT')
    })

    it('Rejects same-domain recursive external query paths', async function () {
      let error

      await Agent.query('same-domain-external-recursive-query').catch(e => error = e)

      expect(error).to.equal('CIRCULAR FOREIGN QUERY')
    })

    it('Preserves requesting domain through cross-domain external queries', async function () {
      const { domain } = await Agent.environment()

      expect(await Agent.query('cross-domain-query-requesting-domain-values'))
        .to.deep.equal([{ value: domain }])
    })

    it('Allows cross-domain external queries from matching requester domain patterns', async function () {
      const { domain } = await Agent.environment()

      expect(await Agent.query('cross-domain-pattern-query-requesting-domain-values'))
        .to.deep.equal([{ value: domain }])
    })

    it('Allows browser Agent.query requests to matching cross-domain patterns', async function () {
      const { domain } = await Agent.environment()

      expect(await Agent.query('wildcard-requesting-domain-values', [], FOREIGN_QUERY_DOMAIN))
        .to.deep.equal([{ value: domain }])
    })

    it('Allows embedded browser Agent.query requests to matching cross-domain patterns', async function () {
      this.timeout(5000)

      let resolve
      const done = new Promise(r => resolve = r)
      const iframe = document.createElement('iframe')
      iframe.style = "border: none; width: 0; height: 0;"
      document.body.appendChild(iframe)

      const { on } = Agent.embed({ id: TEST_ENTRY_1_ID, mode: EMBEDED_CROSS_DOMAIN_QUERY_TEST_MODE }, iframe)

      let closeInfo
      on('close', info => {
        closeInfo = info
        document.body.removeChild(iframe)
        resolve()
      })

      const { domain } = await Agent.environment()

      await done
      expect(closeInfo).to.deep.equal([{ value: domain }])
    })

    it('Preserves context through cross-domain external queries', async function () {
      expect(
        await Agent.query(
          'cross-domain-query-context-values',
          [],
          undefined,
          ['ctx-b', 'ctx-a']
        )
      )
        .to.deep.equal([
          { value: 'ctx-a' },
          { value: 'ctx-b' }
        ])
    })

    it('Rejects unauthorized cross-domain external queries', async function () {
      let error

      await Agent.query('unauthorized-cross-domain-external-query').catch(e => error = e)

      expect(error).to.equal(`INVALID QUERY 'forbidden-requesting-domain-values' FOR '${FOREIGN_QUERY_DOMAIN}'`)
    })

    it('Rejects direct circular query references', async function () {
      let error

      await Agent.query('self-referential-query').catch(e => error = e)

      expect(error).to.equal('CIRCULAR FOREIGN QUERY')
    })

    it('Can consume implicit same-domain references via unnest', async function () {
      expect(await Agent.query('implicit-unnest-query-values', [false]))
        .to.deep.equal(sortRowsByValue([
          { value: TEST_ENTRY_2_ID },
          { value: TEST_ENTRY_3_ID },
          { value: TEST_ENTRY_4_ID }
        ]))
    })

    it('Can reuse the same implicit same-domain reference in one body', async function () {
      expect(await Agent.query('repeated-implicit-query-counts', [false]))
        .to.deep.equal([{ first_count: 3, second_count: 3 }])
    })

    it('Rejects missing implicit same-domain references', async function () {
      let error
      const { domain } = await Agent.environment()

      await Agent.query('missing-implicit-query').catch(e => error = e)

      expect(error).to.equal(`INVALID QUERY 'missing-implicit-query-target' FOR '${domain}'`)
    })

    it('Supports hyphenated implicit same-domain query names', async function () {
      expect(await Agent.query('implicit-query-selected-entries', [false]))
        .to.deep.equal(expectedSelectedRows)
    })

    it('Rejects indirect same-domain circular query references', async function () {
      let error

      await Agent.query('indirect-cycle-a').catch(e => error = e)

      expect(error).to.equal('CIRCULAR FOREIGN QUERY')
    })

    it('Rejects implicit same-domain references to multi-column queries', async function () {
      let error

      await Agent.query('implicit-multi-column-query').catch(e => error = e)

      expect(error).to.equal('INVALID FOREIGN QUERY RESULT')
    })

    it('Supports queries with only positional placeholders', async function () {
      expect(await Agent.query('positional-only-query', [false]))
        .to.deep.equal([{ first_value: false, second_value: false }])
    })

    it('Supports queries mixing positional placeholders and named bindings', async function () {
      const { domain } = await Agent.environment()

      expect(await Agent.query('positional-and-named-query', [false]))
        .to.deep.equal([{ bool_value: false, domain_value: domain }])
    })

    it('Preserves positional placeholder order when explicit externals are also present', async function () {
      const { domain } = await Agent.environment()

      expect(await Agent.query('compacted-param-query', [false]))
        .to.deep.equal([{ bool_value: false, selected_count: 3, domain_value: domain }])
    })

    it('Does not rewrite placeholders inside SQL string literals', async function () {
      expect(await Agent.query('string-literal-placeholder-query'))
        .to.deep.equal([{ value: '$selected_ids' }])
    })

    it('Does not rewrite placeholders inside SQL comments', async function () {
      expect(await Agent.query('comment-placeholder-query'))
        .to.deep.equal([{ value: TEST_ENTRY_2_ID }])
    })

    it('Does not rewrite placeholders inside quoted identifiers', async function () {
      expect(await Agent.query('quoted-identifier-placeholder-query'))
        .to.deep.equal([{ '$selected_ids': 1 }])
    })

    it('Does not rewrite placeholders inside dollar-quoted strings', async function () {
      expect(await Agent.query('dollar-quoted-placeholder-query'))
        .to.deep.equal([{ value: ' $selected_ids ' }])
    })

    it('Rejects cross-domain circular query references', async function () {
      let error

      await Agent.query('cross-domain-circular-query').catch(e => error = e)

      expect(error).to.equal('CIRCULAR FOREIGN QUERY')
    })

    it('Supports valid implicit query chains below the depth limit', async function () {
      expect(await Agent.query('deep-valid-chain-0'))
        .to.deep.equal([{ value: TEST_ENTRY_2_ID }])
    })

    it('Rejects implicit query chains that exceed the depth limit', async function () {
      let error

      await Agent.query('deep-exceeded-chain-0').catch(e => error = e)

      expect(error).to.equal('FOREIGN QUERY DEPTH EXCEEDED')
    })

    it('Rejects legacy embedded query syntax with a query error', async function () {
      let error
      const { domain } = await Agent.environment()

      await Agent.query('legacy-query-syntax').catch(e => error = e)

      expect(error).to.equal(`INVALID QUERY 'query' FOR '${domain}'`)
    })

    it('Can resolve many parallel queries at once', async function () {
      this.timeout(5000)
      const numParallelQueries = 100
      const queries = []
      const expectedValues = []
      for (let i=0; i<numParallelQueries; i++) {
        queries.push(Agent.query('my-reconfigured-test-table-entries'))
        expectedValues.push([{ id: TEST_ENTRY_1_ID, ...TEST_ENTRY_1 }])
      }
      const results = await Promise.all(queries)
      expect(expectedValues).to.deep.equal(results)
    })

    it('Cannot query old tables', async function () {
      let erroredExpectedly = false
      let error
      await
        Agent
          .query('my-old-test-table')
          .catch(e => {
            erroredExpectedly = e === '42P01'
            error = e
          })
      if (!erroredExpectedly) throw new Error(`Expected postgres 42P01 error on query involving new table; received ${error}`)
    })

  })
}
