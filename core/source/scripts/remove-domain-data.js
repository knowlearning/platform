import * as redis from '../redis.js'


await redis.connected

/*
Other Domains To Consider

f74e9cb3-2b53-4c85-9b0c-f1d61b032b3f.localhost:9898 -> ~0.1Gb

To Confirm with Matt:
19188b19-bdaa-4a15-86ee-9bd442a13422.localhost:9898 -> ~0.2Gb
*/

const DOMAIN_TO_DELETE = 'pila-friday-demo.netlify.app'

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
  setTimeout(logLoop, 3000)
}

logLoop()

//  delete domain specific meta keys
redis.connected.then(() => {
  redis.client.del(DOMAIN_TO_DELETE)
})

//  delete domain data keys
scanKeys('0', '*', 1000, function (keys) {
  return Promise.all(
    keys.map(async key => {
      try {
        const [ domain ] = await redis.client.json.get(key, { path: [`$.domain`] })
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