const REQUIRED_ENVIRONMENT = {
  POSTGRES_SERVERS: '{"default":{"host":"postgres.example.com","port":5432,"user":"postgres","password":"..."}}'
}

for (const [name, example] of Object.entries(REQUIRED_ENVIRONMENT)) {
  if (Deno.env.get(name)) continue

  const value = prompt(`${name} is not set. Enter its JSON value\nExample: ${example}`)?.trim()
  if (!value) throw new Error(`${name} is required`)

  Deno.env.set(name, value)
}

const postgres = await import('../postgres.js')
const { postgresClientPools } = await import('../stateful.js')

const BATCH_SIZE = 1000

const CANDIDATE_PREDICATE = `
  path = ARRAY[
    to_jsonb('core'::TEXT),
    to_jsonb(id::TEXT)
  ]
`

const COUNT_CANDIDATES_QUERY = `
  SELECT COUNT(*)::INTEGER AS count
  FROM state
  WHERE ${CANDIDATE_PREDICATE}
`

const MIGRATE_QUERY = `
  WITH candidates AS (
    SELECT id
    FROM state
    WHERE ${CANDIDATE_PREDICATE}
    LIMIT $1
    FOR UPDATE SKIP LOCKED
  ),
  migrated AS (
    UPDATE state AS ownership
    SET id = gen_random_uuid()
    FROM candidates
    WHERE ownership.id = candidates.id
    RETURNING ownership.id
  )
  SELECT COUNT(*)::INTEGER AS count
  FROM migrated
`

function formatDuration(seconds) {
  if (!Number.isFinite(seconds)) return 'unknown'
  if (seconds < 60) return `${Math.ceil(seconds)}s`

  const minutes = Math.floor(seconds / 60)
  const remainingSeconds = Math.ceil(seconds % 60)
  return `${minutes}m ${remainingSeconds}s`
}

function progressSummary(migrated, total, startedAt) {
  const elapsedSeconds = (Date.now() - startedAt) / 1000
  const rate = elapsedSeconds > 0 ? migrated / elapsedSeconds : 0
  const remainingSeconds = rate > 0 ? (total - migrated) / rate : Infinity
  const percentage = total > 0 ? (migrated / total * 100).toFixed(1) : '100.0'

  return [
    `${migrated.toLocaleString()}/${total.toLocaleString()} rows`,
    `${percentage}%`,
    `${rate.toFixed(1)} rows/s`,
    `${formatDuration(elapsedSeconds)} elapsed`,
    `${formatDuration(remainingSeconds)} remaining`
  ].join(', ')
}

async function closeConnections() {
  const pools = await Promise.all(Object.values(postgresClientPools))
  await Promise.allSettled(pools.map(pool => pool.end()))
}

try {
  const { rows: [candidateResult] } = await postgres.query('core', COUNT_CANDIDATES_QUERY)
  const candidateCount = candidateResult.count

  console.log(`${candidateCount.toLocaleString()} legacy core ownership rows found.`)

  if (candidateCount === 0) {
    console.log('Nothing to migrate.')
  }
  else {
    const confirmed = Deno.args.includes('--yes') ||
      prompt(`Replace their row IDs with new UUIDs? Type "migrate" to continue`)?.trim() === 'migrate'

    if (!confirmed) {
      console.log('Migration cancelled; no rows changed.')
    }
    else {
      const startedAt = Date.now()
      let migratedCount = 0
      let batch = 0

      console.log(`Starting migration in batches of ${BATCH_SIZE.toLocaleString()} rows.`)

      while (true) {
        const { rows: [migrationResult] } = await postgres.query('core', MIGRATE_QUERY, [BATCH_SIZE])
        if (migrationResult.count === 0) break

        batch++
        migratedCount += migrationResult.count
        console.log(`Batch ${batch.toLocaleString()}: ${progressSummary(migratedCount, candidateCount, startedAt)}`)
      }

      const elapsedSeconds = (Date.now() - startedAt) / 1000
      console.log(
        `Migration complete: ${migratedCount.toLocaleString()} rows in ${formatDuration(elapsedSeconds)}.`
      )
    }
  }
}
finally {
  await closeConnections()
}
