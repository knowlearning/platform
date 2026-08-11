const REQUIRED_ENVIRONMENT = {
  REDIS_SERVERS: '{"default":{"host":"redis.example.com","port":6379,"password":"..."}}',
  POSTGRES_SERVERS: '{"default":{"host":"postgres.example.com","port":5432,"user":"postgres","password":"..."}}'
}

if (!Deno.env.get('MODE')) {
  const value = prompt('MODE is not set. Enter "production" for Redis TLS [production]')
  if (value === null) throw new Error('MODE is required')

  Deno.env.set('MODE', value.trim() || 'production')
}

for (const [name, example] of Object.entries(REQUIRED_ENVIRONMENT)) {
  if (Deno.env.get(name)) continue

  const value = prompt(`${name} is not set. Enter its JSON value\nExample: ${example}`)?.trim()
  if (!value) throw new Error(`${name} is required`)

  Deno.env.set(name, value)
}

const postgres = await import('../postgres.js')
const redis = await import('../redis.js')
const { postgresClientPools } = await import('../stateful.js')

const BATCH_SIZE = 1000
const PROGRESS_BATCH_INTERVAL = 100
const UUID_PATTERN = '????????-????-????-????-????????????'
const UUID_REGEX = /^(?:[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i
const isUUID = value => UUID_REGEX.test(value)

function progressSummary(stats) {
  const skipped = stats.withDomains - stats.inserted
  const missingDomains = stats.uuids - stats.withDomains

  return [
    `${stats.batches.toLocaleString()} scan batches`,
    `${stats.matches.toLocaleString()} pattern matches`,
    `${stats.uuids.toLocaleString()} UUIDs`,
    `${stats.withDomains.toLocaleString()} with domains`,
    `${stats.inserted.toLocaleString()} inserted`,
    `${skipped.toLocaleString()} conflicts skipped`,
    `${missingDomains.toLocaleString()} missing domains`
  ].join(', ')
}

const INSERT_STATES_QUERY = `
  WITH input(id, domain) AS (
    SELECT * FROM UNNEST($1::UUID[], $2::TEXT[])
  ),
  inserted AS (
    INSERT INTO state (id, path, value, ii)
    SELECT
      id,
      ARRAY[to_jsonb('core'::TEXT), to_jsonb(id::TEXT)],
      to_jsonb(domain),
      0
    FROM input
    ON CONFLICT (id) DO NOTHING
    RETURNING id
  )
  SELECT COUNT(*)::INTEGER AS inserted FROM inserted
`

async function migrateRedisStates() {
  const totals = {
    batches: 0,
    matches: 0,
    uuids: 0,
    withDomains: 0,
    inserted: 0
  }
  const startedAt = Date.now()
  await redis.connected

  for (const { serverName, client } of redis.commandClients()) {
    let cursor = '0'
    const stats = {
      batches: 0,
      matches: 0,
      uuids: 0,
      withDomains: 0,
      inserted: 0
    }

    console.log(`[${serverName}] Starting Redis scan`)

    do {
      const [nextCursor, keys] = await client.sendCommand([
        'SCAN', cursor,
        'MATCH', UUID_PATTERN,
        'COUNT', String(BATCH_SIZE)
      ])
      cursor = nextCursor
      stats.batches++
      stats.matches += keys.length

      const redisIds = keys.filter(isUUID)
      stats.uuids += redisIds.length

      if (redisIds.length > 0) {
        const redisDomains = await client.sendCommand([
          'JSON.MGET', ...redisIds, '$.domain'
        ])
        const states = redisIds.flatMap((id, index) => {
          if (!redisDomains[index]) return []

          const value = JSON.parse(redisDomains[index])
          const domain = Array.isArray(value) ? value[0] : value
          return domain ? [[id.toLowerCase(), domain]] : []
        })
        stats.withDomains += states.length

        if (states.length > 0) {
          const ids = states.map(([id]) => id)
          const domains = states.map(([, domain]) => domain)
          const { rows } = await postgres.query('core', INSERT_STATES_QUERY, [ids, domains])
          stats.inserted += rows[0].inserted
        }
      }

      if (
        cursor !== '0' &&
        (stats.batches === 1 || stats.batches % PROGRESS_BATCH_INTERVAL === 0)
      ) {
        console.log(`[${serverName}] Progress: ${progressSummary(stats)}; cursor ${cursor}`)
      }
    } while (cursor !== '0')

    console.log(`[${serverName}] Complete: ${progressSummary(stats)}`)

    for (const key of Object.keys(totals)) totals[key] += stats[key]
  }

  const elapsedSeconds = ((Date.now() - startedAt) / 1000).toFixed(1)
  console.log(`Migration complete in ${elapsedSeconds}s: ${progressSummary(totals)}`)
}

async function closeConnections() {
  await Promise.allSettled([
    ...redis.commandClients().map(({ client }) => client.quit()),
    redis.subscriptions.quit()
  ])

  const pools = await Promise.all(Object.values(postgresClientPools))
  await Promise.allSettled(pools.map(pool => pool.end()))
}

try {
  await migrateRedisStates()
}
finally {
  await closeConnections()
}
