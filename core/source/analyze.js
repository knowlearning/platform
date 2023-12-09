import * as redis from './redis.js'

console.log('STARTING ANALYSIS...')

// Function to scan keys
let scans = 0
let done = false
async function scanKeys(cursor, pattern, batchSize, callback) {
  const { cursor: nextCursor, keys } = await redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize)

  await callback(keys)
  scans += 1

  if (scans % 100 === 0) console.log('SCAN', scans)

  if (nextCursor) scanKeys(nextCursor, pattern, batchSize, callback)
  else {
    console.log('DONE SCANNING', nextCursor, typeof nextCursor)
    done = true
  }
}

const domainTypeSizes = {}
const errors = {}
const localhostRegex = /^(?:[a-zA-Z0-9-]+\.)*localhost(?::\d+)?$/

function logLoop() {
  console.log(JSON.stringify(domainTypeSizes))
  console.log(errors)
  if (!done) setTimeout(logLoop, 3000)
}

await redis.connected
console.log('STARTING SCAN')

if (true) logLoop()

scanKeys('0', '*', 1000, function (keys) {
  return Promise.all(
    keys.map(async key => {
      try {
        if (key.includes('/')) {
          const domain = 'PREFIX+' + key.split('/')[0]
          if (!domainTypeSizes[domain]) domainTypeSizes[domain] = { all: 0 }
          domainTypeSizes[domain].all += await redis.client.sendCommand(['MEMORY', 'USAGE', key])
        }
        else {
          const domain = await redis.client.json.get(key, { path: [`$.domain`] })
          const active_type = await redis.client.json.get(key, { path: [`$.active_type`] })
          if (!domainTypeSizes[domain]) domainTypeSizes[domain] = {}
          if (!domainTypeSizes[domain][active_type]) domainTypeSizes[domain][active_type] = 0
          domainTypeSizes[domain][active_type] += await redis.client.sendCommand(['MEMORY', 'USAGE', key])
        }
      }
      catch (error) {
        const s = error.toString()
        if (errors[s]) errors[s] += 1
        else errors[s] = 1
      }
    })
  )
})