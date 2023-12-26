import * as redis from './redis.js'


await redis.connected

const DOMAIN_TO_DELETE = 'pila-friday-demo.knowlearning.systems'

// Function to scan keys
let scans = 0
async function scanKeys(cursor, pattern, batchSize, callback) {
  const { cursor: nextCursor, keys } = await redis.client.scan(cursor, 'MATCH', pattern, 'COUNT', batchSize)

  await callback(keys)
  scans += 1

  if (scans % 100 === 0) console.log('SCAN', scans)

  if (nextCursor !== 0) scanKeys(nextCursor, pattern, batchSize, callback)
}

const errors = {}

function logLoop() {
  console.log(errors)
  cancelTimeout = setTimeout(logLoop, 3000)
}

logLoop()

scanKeys('0', '*', 1000, function (keys) {
  return Promise.all(
    keys.map(async key => {
      try {
        const domain = await redis.client.json.get(key, { path: [`$.domain`] })
        if (domain === DOMAIN_TO_DELETE) await redis.client.del(key)
      }
      catch (error) {
        const s = error.toString()
        if (errors[s]) errors[s] += 1
        else errors[s] = 1
      }
    })
  )

})