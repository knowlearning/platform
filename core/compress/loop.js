import { client, connected } from '../redis.js'

export default async function compressionLoop(cursor='0') {
    await connected
    client.scan(cursor, 'COUNT', 100, (error, reply) => {
      if (error) {
        console.error('Error scanning:', error)
        client.quit()
        return
      }

      const [cursor, keys] = reply

      keys.forEach(async key => {
        console.log(key)
      })

      // cursor returns to 0 once all keys scanned
      if (cursor !== '0') compressionLoop(cursor)
    });
}
