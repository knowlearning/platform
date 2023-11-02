import { brotliCompress, brotliDecompress } from 'zlib'
import * as redis from '../redis.js'

const BATCH_SIZE = 100
const BATCH_DELAY_MS = 1000

let totalRaw = 0
let totalCompressed = 0

export default async function compressionLoop(cursor='0') {
    await redis.connected
    console.log('COMPRESS Loop Started')
    redis.client.scan(cursor, 'COUNT', BATCH_SIZE, (error, reply) => {
      if (error) {
        console.error('Error scanning:', error)
        client.quit()
        return
      }

      const [cursor, keys] = reply

      const transaction = redis.client.multi()

      keys.forEach(key => transaction.sendCommand(['OBJECT', 'IDLETIME', key]))
      keys.forEach(key => transaction.sendCommand(['MEMORY', 'USAGE', key]))

      const response = await transaction.exec()

      const idleTimes = response.slice(0, keys.length)
      const memoryUsage = response.slice(keys.length)

      const jsonDataTransaction = redis.client.multi()
      keys.forEach(key => jsonDataTransaction.json.get(key))
      const blobDataArray = await jsonDataTransaction.exec()

      const totalUncompressedBlobBytes = memoryUsage.reduce((a, b) => a + b, 0)
      const totalCompressedBlobBytes = (await compressJSON(blobDataArray)).length
      console.log('COMPRESS Overall Blob Compression Ratio', totalCompressedBlobBytes, totalUncompressedBlobBytes, totalCompressedBlobBytes/totalUncompressedBlobBytes)

      const individualCompressedBlobBytes = Promise.all(blobDataArray.map(async data => (await compressJSON(data)).length))
      const individualCompressionRatios = individualCompressedBlobBytes.map((value, index) => value/memoryUsage[index])

      console.log('COMPRESS Individual Average Compression Ratio', average(individualCompressionRatios))

      // cursor returns to 0 once all keys scanned
      if (cursor !== '0') {
        setTimeout(() => compressionLoop(cursor), BATCH_DELAY_MS)
      }
    });
}

function compressJSON(data) {
  const jsonString = JSON.stringify(data)
  return new Promise((resolve, reject) => {
    brotliCompress(Buffer.from(jsonString, 'utf8'), (error, result) => error ? reject(error) : resolve(result))
  })
}

function decompressJSON(data) {
  return new Promise((resolve, reject) => {
    brotliDecompress(data, (error, result) => error ? reject(error) : resolve(JSON.parse(result.toString('utf8'))))
  })
}

function average(arr) {
  if (arr.length === 0) return 0
  else return arr.reduce((a, v) => a + v, 0) / arr.length
}