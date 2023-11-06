import { brotliCompress, brotliDecompress } from 'zlib'
import * as redis from '../redis.js'

const BATCH_SIZE = '1000'
const BATCH_DELAY_MS = 1000

let totalRaw = 0
let totalCompressed = 0

export default async function compressionLoop(startCursor='0', numProcessed=0) {
  return
  await redis.connected
  console.log('COMPRESS Loop Started Again With', numProcessed, 'Processed So far')

  const scanResponse = await redis.client.sendCommand(['SCAN', startCursor, 'COUNT', BATCH_SIZE])

  // cursor is NOT INCREMENTAL. It is an id for an internal redis cursor
  const [ cursor, keys ] = scanResponse

  const keyTypeTransaction = redis.client.multi()
  keys.forEach(key => keyTypeTransaction.type(key))
  const keyTypes = await keyTypeTransaction.exec()

  const jsonKeys = keys.filter((key, index) => keyTypes[index] === 'ReJSON-RL')

  const transaction = redis.client.multi()

  jsonKeys.forEach(key => transaction.OBJECT_IDLETIME(key))
  jsonKeys.forEach(key => transaction.MEMORY_USAGE(key))

  const response = await transaction.exec()
  const idleTimes = response.slice(0, jsonKeys.length)
  const memoryUsage = response.slice(jsonKeys.length)

  const jsonDataTransaction = redis.client.multi()
  jsonKeys.forEach(key => jsonDataTransaction.json.get(key))
  const blobDataArray = await jsonDataTransaction.exec()

  const totalUncompressedBlobBytes = memoryUsage.reduce((a, b) => a + b, 0)
  const totalCompressedBlobBytes = (await compressJSON(blobDataArray)).length
  console.log('COMPRESS Overall Blob Compression Ratio', totalCompressedBlobBytes, totalUncompressedBlobBytes, totalCompressedBlobBytes/totalUncompressedBlobBytes)

  const individualCompressedBlobBytes = await Promise.all(blobDataArray.map(async data => (await compressJSON(data)).length))
  const individualCompressionRatios = individualCompressedBlobBytes.map((value, index) => value/memoryUsage[index])

  console.log('COMPRESS Individual Average Compression Ratio', average(individualCompressionRatios))

  // cursor is 0 once all keys scanned
  if (cursor !== '0') {
    await new Promise(r => setTimeout(r, BATCH_DELAY_MS))
    return compressionLoop(cursor, numProcessed + jsonKeys.length)
  }
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