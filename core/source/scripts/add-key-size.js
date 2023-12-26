import * as redis from '../redis.js'

// Function to scan keys
let scans = 0
async function scanKeys(cursor, pattern, batchSize, callback) {
  await redis.connected
  const { cursor: nextCursor, keys } = await redis.client.scan(cursor, { COUNT: batchSize })

  await callback(keys)
  scans += 1

  if (scans % 10 === 0) console.log('SCAN', scans)

  if (nextCursor === 0) console.log('SCAN COMPLETE', scans)
  else scanKeys(nextCursor, pattern, batchSize, callback)
}

const localhostDomainSizes = {}
const errors = {}
const localhostRegex = /^(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/

scanKeys('0', '*', 1000, function (keys) {
  return Promise.all(
    keys.map(async key => {
      try {
        const domain = await redis.client.json.get(key, { path: [`$.domain`] })
        if (!localhostDomainSizes[domain]) localhostDomainSizes[domain] = 0
        const size = parseInt(await redis.client.sendCommand(['JSON.DEBUG', 'MEMORY', key]))
        localhostDomainSizes[domain] += size
        await redis.client.json.set(key, `$.active_size`, size)
      }
      catch (error) {
        const s = error.toString()
        if (errors[s]) errors[s] += 1
        else errors[s] = 1

        if (errors[s] === 1 || errors[s] % 10 === 0) {
          console.log(errors)
        }
      }
    })
  )
})

