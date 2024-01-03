import * as redis from '../redis.js'

// Function to scan keys
let scans = 0
let stopLogLoop
const errors = {}

async function scanRedis(cursor, pattern, batchSize, callback, done) {
  await redis.connected
  const { cursor: nextCursor, keys } = await redis.client.scan(cursor, { COUNT: batchSize })

  await Promise.all(
    keys.map(async key => {
      try { await callback(key) }
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
  scans += 1

  if (scans % 10 === 0) console.log('SCAN', scans)

  if (nextCursor === 0) {
    console.log('SCAN COMPLETE', scans)
    clearTimeout(stopLogLoop)
    done()
  }
  else scanRedis(nextCursor, pattern, batchSize, callback, done)
}

function logLoop() {
  console.log(errors)
  stopLogLoop = setTimeout(logLoop, 3000)
}

export default function(cursor, pattern, batchSize, callback) {
  return new Promise (r => scanRedis(cursor, pattern, batchSize, callback, r))
}